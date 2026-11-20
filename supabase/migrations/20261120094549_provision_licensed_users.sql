-- The admin API creates the Auth row and its clinic membership in one transaction.
-- Supabase ignores app_metadata supplied by a public signup or a user update.
create function private.provision_auth_license()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  license jsonb := new.raw_app_meta_data -> 'vittadesk_license';
  member_name text := btrim(license ->> 'name');
begin
  if not exists (
    select 1 from private.license_owner
    where user_id = (license ->> 'owner_id')::uuid
    for share
  ) then
    raise exception 'Acesso restrito à conta proprietária.' using errcode = '42501';
  end if;

  if member_name is null or length(member_name) not between 1 and 120 then
    raise exception 'Informe um nome entre 1 e 120 caracteres.' using errcode = '22023';
  end if;

  insert into public.clinic_members(clinic_id, user_id, name, role)
    values ((license ->> 'clinic_id')::uuid, new.id, member_name, (license ->> 'role')::public.member_role);

  update auth.users
    set raw_app_meta_data = raw_app_meta_data - 'vittadesk_license'
    where id = new.id;
  return new;
end;
$$;

revoke all on function private.provision_auth_license() from public, anon, authenticated;

create trigger vittadesk_provision_auth_license
after insert on auth.users
for each row when (new.raw_app_meta_data ? 'vittadesk_license')
execute function private.provision_auth_license();
