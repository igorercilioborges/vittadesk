create function private.license_admin_find_account(p_email text, p_clinic_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  account_id uuid;
  confirmed boolean;
  access jsonb;
begin
  if not private.is_license_owner() then
    raise exception 'Acesso restrito à conta proprietária.' using errcode = '42501';
  end if;
  if p_email is null or length(btrim(p_email)) not between 3 and 254
     or btrim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Informe um e-mail válido.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.clinics where id = p_clinic_id) then
    raise exception 'Selecione uma clínica válida.' using errcode = '22023';
  end if;

  select u.id, u.email_confirmed_at is not null into account_id, confirmed
  from auth.users u
  where lower(u.email) = lower(btrim(p_email))
  order by (u.email_confirmed_at is not null) desc, u.id
  limit 1;

  if account_id is null then
    return jsonb_build_object('status', 'new');
  end if;
  if not confirmed then
    return jsonb_build_object('status', 'unconfirmed');
  end if;

  select jsonb_build_object('name', m.name, 'role', m.role) into access
  from public.clinic_members m
  where m.clinic_id = p_clinic_id and m.user_id = account_id;

  return jsonb_build_object('status', 'existing', 'license', access);
end;
$$;

create function public.license_admin_find_account(p_email text, p_clinic_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.license_admin_find_account(p_email, p_clinic_id);
$$;

revoke all on function private.license_admin_find_account(text, uuid),
  public.license_admin_find_account(text, uuid) from public, anon, authenticated;
grant execute on function private.license_admin_find_account(text, uuid),
  public.license_admin_find_account(text, uuid) to authenticated;
