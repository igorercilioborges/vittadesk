-- Provision the operator by Auth user ID via the SQL editor. Tenant admins
-- manage clinic settings but receive no license-management privilege.
create table private.license_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id) on delete cascade
);
alter table private.license_owner enable row level security;
revoke all on private.license_owner from public, anon, authenticated;

create function private.is_license_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.license_owner where user_id = (select auth.uid())
  );
$$;

create function private.license_admin_snapshot()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_license_owner() then
    raise exception 'Acesso restrito à conta proprietária.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'clinics', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name, c.id)
      from public.clinics c
    ), '[]'::jsonb),
    'licenses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'clinic_name', c.name, 'email', u.email, 'name', m.name, 'role', m.role
      ) order by c.name, m.name, m.id)
      from public.clinic_members m
      join public.clinics c on c.id = m.clinic_id
      join auth.users u on u.id = m.user_id
    ), '[]'::jsonb)
  );
end;
$$;

create function private.license_admin_create_clinic(p_name text, p_slug text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  new_id uuid;
begin
  if not private.is_license_owner() then
    raise exception 'Acesso restrito à conta proprietária.' using errcode = '42501';
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 120
     or p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_slug) > 63 then
    raise exception 'Informe um nome e um identificador com letras minúsculas, números ou hífens.'
      using errcode = '22023';
  end if;
  insert into public.clinics(name, slug) values (btrim(p_name), p_slug) returning id into new_id;
  return new_id;
end;
$$;

create function private.license_admin_grant(p_clinic_id uuid, p_email text, p_name text, p_role public.member_role)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  account_id uuid;
  license_id uuid;
begin
  if not private.is_license_owner() then
    raise exception 'Acesso restrito à conta proprietária.' using errcode = '42501';
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 120 or p_role is null then
    raise exception 'Informe o nome e o perfil do usuário.' using errcode = '22023';
  end if;
  select id into strict account_id
    from auth.users where lower(email) = lower(btrim(p_email)) and email_confirmed_at is not null;
  insert into public.clinic_members(clinic_id, user_id, name, role)
    values (p_clinic_id, account_id, btrim(p_name), p_role)
    on conflict (clinic_id, user_id) do update set name = excluded.name, role = excluded.role
    returning id into license_id;
  return license_id;
exception
  when no_data_found then
    raise exception 'Cadastre ou confirme esse e-mail no Supabase Auth primeiro.' using errcode = '22023';
end;
$$;

create function private.license_admin_revoke(p_license_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_license_owner() then
    raise exception 'Acesso restrito à conta proprietária.' using errcode = '42501';
  end if;
  delete from public.clinic_members where id = p_license_id;
  return found;
end;
$$;

create function public.is_license_owner()
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.is_license_owner();
$$;

create function public.license_admin_snapshot()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.license_admin_snapshot();
$$;

create function public.license_admin_create_clinic(p_name text, p_slug text)
returns uuid language sql security invoker set search_path = '' as $$
  select private.license_admin_create_clinic(p_name, p_slug);
$$;

create function public.license_admin_grant(p_clinic_id uuid, p_email text, p_name text, p_role public.member_role)
returns uuid language sql security invoker set search_path = '' as $$
  select private.license_admin_grant(p_clinic_id, p_email, p_name, p_role);
$$;

create function public.license_admin_revoke(p_license_id uuid)
returns boolean language sql security invoker set search_path = '' as $$
  select private.license_admin_revoke(p_license_id);
$$;

revoke all on function
  private.is_license_owner(), private.license_admin_snapshot(),
  private.license_admin_create_clinic(text,text), private.license_admin_grant(uuid,text,text,public.member_role),
  private.license_admin_revoke(uuid), public.is_license_owner(), public.license_admin_snapshot(),
  public.license_admin_create_clinic(text,text), public.license_admin_grant(uuid,text,text,public.member_role),
  public.license_admin_revoke(uuid)
  from public, anon, authenticated;
grant execute on function
  private.is_license_owner(), private.license_admin_snapshot(),
  private.license_admin_create_clinic(text,text), private.license_admin_grant(uuid,text,text,public.member_role),
  private.license_admin_revoke(uuid), public.is_license_owner(), public.license_admin_snapshot(),
  public.license_admin_create_clinic(text,text), public.license_admin_grant(uuid,text,text,public.member_role),
  public.license_admin_revoke(uuid)
  to authenticated;
