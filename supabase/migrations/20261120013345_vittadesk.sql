create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;
set search_path = public, extensions;

create type member_role as enum ('admin','manager','receptionist','doctor');
create type appointment_status as enum ('scheduled','confirmed','completed','cancelled','no_show');
create type payment_status as enum ('pending','paid');
create type appointment_source as enum ('human','maria');
create type insurance_type as enum ('particular','convenio');
create type whatsapp_status as enum ('disconnected','qr_ready','connected');

create table clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  settings jsonb not null default '{"timezone":"America/Sao_Paulo","duration":30,"rules":"","hours":{"1":["08:00","18:00"],"2":["08:00","18:00"],"3":["08:00","18:00"],"4":["08:00","18:00"],"5":["08:00","18:00"]}}',
  created_at timestamptz not null default now()
);
create table clinic_members (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role member_role not null,
  name text not null,
  unique(clinic_id,user_id)
);
create index clinic_members_user on clinic_members(user_id,clinic_id);
create table professionals (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics on delete cascade,
  name text not null,
  specialty text not null,
  active boolean not null default true,
  unique(clinic_id,id)
);
create table appointment_tags (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics on delete cascade,
  name text not null,
  color text not null default '#0284C7' check (color ~ '^#[0-9a-fA-F]{6}$'),
  default_price numeric(12,2) not null default 0 check(default_price >= 0),
  unique(clinic_id,id),
  unique(clinic_id,name)
);
create table patients (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics on delete cascade,
  full_name text not null,
  phone text not null check(phone ~ '^[0-9]{8,15}$'),
  email text,
  cpf text,
  insurance_type insurance_type not null default 'particular',
  notes text,
  created_at timestamptz not null default now(),
  unique(clinic_id,id),
  unique(clinic_id,phone)
);
create index patients_name on patients(clinic_id,full_name);
create table appointments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics on delete cascade,
  patient_id uuid not null,
  professional_id uuid not null,
  tag_id uuid not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  status appointment_status not null default 'scheduled',
  price numeric(12,2) not null check(price >= 0),
  payment_status payment_status not null default 'pending',
  created_by appointment_source not null default 'human',
  check(end_time > start_time),
  unique(clinic_id,id),
  foreign key(clinic_id,patient_id) references patients(clinic_id,id),
  foreign key(clinic_id,professional_id) references professionals(clinic_id,id),
  foreign key(clinic_id,tag_id) references appointment_tags(clinic_id,id),
  constraint appointments_no_overlap exclude using gist (
    clinic_id with =, professional_id with =, tstzrange(start_time,end_time,'[)') with &&
  ) where (status in ('scheduled','confirmed','completed'))
);
create index appointments_start on appointments(clinic_id,start_time);
create index appointments_patient on appointments(clinic_id,patient_id,start_time);
create index appointments_tag on appointments(clinic_id,tag_id,start_time);

create table whatsapp_sessions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null unique references clinics on delete cascade,
  status whatsapp_status not null default 'disconnected',
  phone_number text,
  enabled boolean not null default true,
  maria_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
-- Credentials live apart from the Realtime publication.
create table whatsapp_credentials (
  clinic_id uuid primary key references clinics on delete cascade,
  session_data jsonb not null default '{}'
);
create table conversations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics on delete cascade,
  patient_id uuid,
  remote_jid text not null,
  phone text,
  is_bot_paused boolean not null default false,
  updated_at timestamptz not null default now(),
  unique(clinic_id,id),
  unique(clinic_id,remote_jid),
  foreign key(clinic_id,patient_id) references patients(clinic_id,id)
);
create index conversations_by_activity on conversations(clinic_id,updated_at desc);
create table messages (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics on delete cascade,
  conversation_id uuid not null,
  external_id text,
  sender text not null check(sender in ('patient','human','maria')),
  body text not null check(length(body) between 1 and 12000),
  delivery text not null default 'queued' check(delivery in ('queued','processing','sent','failed','received')),
  handled_at timestamptz,
  send_attempts smallint not null default 0,
  next_attempt timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(clinic_id,conversation_id,external_id),
  unique(clinic_id,id),
  unique(clinic_id,conversation_id,id),
  foreign key(clinic_id,conversation_id) references conversations(clinic_id,id)
);
create index messages_timeline on messages(clinic_id,conversation_id,created_at);
create index inbound_waiting on messages(created_at) where sender='patient' and handled_at is null;
create index outbound_due on messages(clinic_id,next_attempt,created_at) where delivery='queued';
create table gmail_integrations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null unique references clinics on delete cascade,
  email_address text not null,
  daily_summary boolean not null default false,
  last_summary_day date,
  active boolean not null default true
);
create table gmail_credentials (
  clinic_id uuid primary key references gmail_integrations(clinic_id) on delete cascade,
  token_data jsonb not null
);
create table agent_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics on delete cascade,
  agent_name text not null default 'Maria' check(agent_name = 'Maria'),
  action_type text not null,
  description text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index agent_events_recent on agent_events(clinic_id,created_at desc);
create table confirmation_jobs (
  clinic_id uuid not null references clinics on delete cascade,
  appointment_id uuid not null,
  attempts integer not null default 0,
  next_attempt timestamptz not null default now(),
  sent_at timestamptz,
  primary key(clinic_id,appointment_id),
  foreign key(clinic_id,appointment_id) references appointments(clinic_id,id) on delete cascade
);

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
create function private.is_member(target uuid, roles public.member_role[] default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.clinic_members
    where clinic_id = target and user_id = (select auth.uid())
      and (roles is null or role = any(roles)));
$$;
revoke all on function private.is_member(uuid,public.member_role[]) from public;
grant execute on function private.is_member(uuid,public.member_role[]) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['clinics','clinic_members','professionals','appointment_tags','patients','appointments',
    'whatsapp_sessions','whatsapp_credentials','conversations','messages','gmail_integrations','gmail_credentials',
    'agent_events','confirmation_jobs']
  loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant all on public.%I to service_role',t);
    if t not in ('whatsapp_credentials','gmail_credentials','confirmation_jobs') then
      execute format('grant select on public.%I to authenticated',t);
      execute format('create policy tenant_read on public.%I for select to authenticated using (private.is_member(%I))',
        t, case when t = 'clinics' then 'id' else 'clinic_id' end);
    end if;
  end loop;

  foreach t in array array['professionals','appointment_tags','patients','appointments'] loop
    execute format('grant insert,update on public.%I to authenticated',t);
    execute format('create policy tenant_insert on public.%I for insert to authenticated with check (private.is_member(clinic_id,%L::public.member_role[])%s)',
      t, case when t in ('professionals','appointment_tags') then '{admin,manager}' else '{admin,manager,receptionist}' end,
      case when t = 'appointments' then ' and created_by = ''human''' else '' end);
    execute format('create policy tenant_update on public.%I for update to authenticated using (private.is_member(clinic_id,%L::public.member_role[])) with check (private.is_member(clinic_id,%L::public.member_role[]))',
      t, case when t in ('professionals','appointment_tags') then '{admin,manager}' else '{admin,manager,receptionist}' end,
      case when t in ('professionals','appointment_tags') then '{admin,manager}' else '{admin,manager,receptionist}' end);
    execute format('revoke update on public.%I from authenticated',t);
  end loop;
end $$;
grant update(name,specialty,active) on professionals to authenticated;
grant update(name,color,default_price) on appointment_tags to authenticated;
grant update(full_name,phone,email,cpf,insurance_type,notes) on patients to authenticated;
grant update(patient_id,professional_id,tag_id,start_time,end_time,status,price,payment_status) on appointments to authenticated;
grant update(settings) on clinics to authenticated;
create policy clinic_settings on clinics for update to authenticated
  using(private.is_member(id,'{admin,manager}')) with check(private.is_member(id,'{admin,manager}'));
grant insert(clinic_id),update(enabled) on whatsapp_sessions to authenticated;
create policy whatsapp_insert on whatsapp_sessions for insert to authenticated with check(private.is_member(clinic_id,'{admin,manager}'));
create policy whatsapp_update on whatsapp_sessions for update to authenticated
  using(private.is_member(clinic_id,'{admin,manager}')) with check(private.is_member(clinic_id,'{admin,manager}'));
grant update(is_bot_paused) on conversations to authenticated;
create policy conversation_update on conversations for update to authenticated
  using(private.is_member(clinic_id,'{admin,manager,receptionist}'))
  with check(private.is_member(clinic_id,'{admin,manager,receptionist}'));
grant insert(clinic_id,conversation_id,body,sender) on messages to authenticated;
create policy human_message on messages for insert to authenticated
  with check(sender='human' and private.is_member(clinic_id,'{admin,manager,receptionist}'));
alter publication supabase_realtime add table appointments, whatsapp_sessions, conversations, messages, agent_events;

create function clinic_slots(p_clinic uuid, p_day date, p_specialty text default '')
returns table(professional_id uuid, professional_name text, specialty text, start_time timestamptz, end_time timestamptz)
language sql stable set search_path = public as $$
  with config as (
    select coalesce(settings->>'timezone','America/Sao_Paulo') as tz,
           make_interval(mins => greatest(5,least(480,coalesce((settings->>'duration')::int,30)))) as duration,
           settings->'hours'->(extract(isodow from p_day)::int::text) as hours
    from clinics where id=p_clinic
  ), slots as (
    select instant.s as starts, instant.s+duration as ends
    from config, lateral generate_series(
      p_day+(hours->>0)::time,
      p_day+(hours->>1)::time-duration,
      duration
    ) wall(s)
    cross join lateral (select wall.s at time zone tz) instant(s)
  )
  select p.id,p.name,p.specialty,slots.starts,slots.ends
  from professionals p cross join slots
  where p.clinic_id=p_clinic and p.active and slots.starts > now()
    and (coalesce(p_specialty,'')='' or strpos(lower(p.specialty),lower(p_specialty))>0)
    and not exists (
      select 1 from appointments a where a.clinic_id=p_clinic and a.professional_id=p.id
        and a.status in ('scheduled','confirmed','completed')
        and tstzrange(a.start_time,a.end_time,'[)') && tstzrange(slots.starts,slots.ends,'[)')
    )
  order by slots.starts,p.id;
$$;
revoke all on function clinic_slots(uuid,date,text) from public,anon,authenticated;
grant execute on function clinic_slots(uuid,date,text) to service_role;

create table maria_bookings (
  clinic_id uuid not null references clinics on delete cascade,
  request_id uuid not null,
  appointment_id uuid not null,
  primary key(clinic_id,request_id),
  foreign key(clinic_id,request_id) references messages(clinic_id,id),
  foreign key(clinic_id,appointment_id) references appointments(clinic_id,id)
);
alter table maria_bookings enable row level security;
revoke all on maria_bookings from public,anon,authenticated;
grant all on maria_bookings to service_role;

create function maria_book(p_clinic uuid,p_conversation uuid,p_request uuid,p_name text,p_insurance insurance_type,
  p_professional uuid,p_tag uuid,p_start timestamptz,p_email text default null)
returns uuid language plpgsql set search_path = public as $$
declare
  chat conversations%rowtype;
  found_slot record;
  tag appointment_tags%rowtype;
  patient uuid;
  booking uuid;
  tz text;
begin
  select * into strict chat from conversations where clinic_id=p_clinic and id=p_conversation for update;
  if chat.is_bot_paused or chat.phone is null or nullif(trim(p_name),'') is null then
    raise exception 'Conversa pausada ou cadastro incompleto';
  end if;
  perform 1 from messages where clinic_id=p_clinic and conversation_id=p_conversation and id=p_request and sender='patient';
  if not found then raise exception 'Mensagem inválida'; end if;
  select appointment_id into booking from maria_bookings where clinic_id=p_clinic and request_id=p_request;
  if found then return booking; end if;
  select coalesce(settings->>'timezone','America/Sao_Paulo') into strict tz from clinics where id=p_clinic;
  select * into strict found_slot from clinic_slots(p_clinic,(p_start at time zone tz)::date,'')
    where professional_id=p_professional and start_time=p_start;
  select * into strict tag from appointment_tags where clinic_id=p_clinic and id=p_tag;
  patient := chat.patient_id;
  if patient is null then
    insert into patients(clinic_id,phone,full_name,insurance_type,email) values(p_clinic,chat.phone,trim(p_name),p_insurance,p_email)
      on conflict(clinic_id,phone) do nothing returning id into patient;
    if patient is null then select id into strict patient from patients where clinic_id=p_clinic and phone=chat.phone; end if;
    update conversations set patient_id=patient where clinic_id=p_clinic and id=p_conversation;
  end if;
  if p_email is not null then
    update patients set email=p_email where clinic_id=p_clinic and id=patient and email is null;
  end if;
  insert into appointments(clinic_id,patient_id,professional_id,tag_id,start_time,end_time,price,status,created_by)
    values(p_clinic,patient,p_professional,p_tag,found_slot.start_time,found_slot.end_time,tag.default_price,'confirmed','maria')
    returning id into booking;
  insert into maria_bookings values(p_clinic,p_request,booking);
  insert into agent_events(clinic_id,action_type,description,metadata)
    values(p_clinic,'appointment_booked','Consulta agendada pela Maria',jsonb_build_object('appointment_id',booking));
  return booking;
end;
$$;
revoke all on function maria_book(uuid,uuid,uuid,text,insurance_type,uuid,uuid,timestamptz,text) from public,anon,authenticated;
grant execute on function maria_book(uuid,uuid,uuid,text,insurance_type,uuid,uuid,timestamptz,text) to service_role;


create table whatsapp_qr (
  clinic_id uuid primary key references whatsapp_sessions(clinic_id) on delete cascade,
  qr_code text
);
alter table whatsapp_qr enable row level security;
revoke all on whatsapp_qr from public,anon,authenticated;
grant select on whatsapp_qr to authenticated;
grant all on whatsapp_qr to service_role;
create policy qr_read on whatsapp_qr for select to authenticated using(private.is_member(clinic_id,'{admin,manager}'));
alter publication supabase_realtime add table whatsapp_qr;

create table worker_lease (
  id boolean primary key default true check(id),
  owner uuid not null,
  expires_at timestamptz not null
);
alter table worker_lease enable row level security;
revoke all on worker_lease from public,anon,authenticated;
grant all on worker_lease to service_role;

create function claim_worker(p_owner uuid)
returns boolean language sql set search_path=public as $$
  with claim as (
    insert into worker_lease(owner,expires_at) values(p_owner,now()+interval '90 seconds')
    on conflict(id) do update set owner=excluded.owner, expires_at=excluded.expires_at
    where worker_lease.owner=excluded.owner or worker_lease.expires_at < clock_timestamp()
    returning owner
  )
  select exists(select 1 from claim);
$$;
revoke all on function claim_worker(uuid) from public,anon,authenticated;
grant execute on function claim_worker(uuid) to service_role;

create function configure_gmail(p_clinic uuid,p_email text,p_tokens jsonb,p_summary boolean)
returns void language plpgsql set search_path=public as $$
begin
  insert into gmail_integrations(clinic_id,email_address,active,daily_summary) values(p_clinic,p_email,p_tokens is not null,p_summary)
    on conflict(clinic_id) do update set email_address=excluded.email_address,active=excluded.active,daily_summary=excluded.daily_summary;
  if p_tokens is null then
    delete from gmail_credentials where clinic_id=p_clinic;
  else
    insert into gmail_credentials(clinic_id,token_data) values(p_clinic,p_tokens)
      on conflict(clinic_id) do update set token_data=excluded.token_data;
  end if;
end;
$$;
revoke all on function configure_gmail(uuid,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function configure_gmail(uuid,text,jsonb,boolean) to service_role;

-- Enqueue confirmed appointments with a registered email regardless of origin.
create function queue_confirmation() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status = 'confirmed' and exists(
    select 1 from public.gmail_integrations where clinic_id=new.clinic_id and active
  ) and exists(
    select 1 from public.patients where clinic_id=new.clinic_id and id=new.patient_id and email is not null
  ) then
    insert into public.confirmation_jobs(clinic_id,appointment_id) values(new.clinic_id,new.id) on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function queue_confirmation() from public,anon,authenticated;
create trigger confirmed_appointment after insert or update of status on appointments
  for each row execute function queue_confirmation();

create table maria_offers (
  clinic_id uuid not null references clinics on delete cascade,
  conversation_id uuid not null,
  offer_id uuid primary key default gen_random_uuid(),
  position smallint not null check (position between 1 and 5),
  request_id uuid not null,
  professional_id uuid not null,
  start_time timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key(clinic_id,conversation_id) references conversations(clinic_id,id) on delete cascade,
  foreign key(clinic_id,conversation_id,request_id) references messages(clinic_id,conversation_id,id),
  foreign key(clinic_id,professional_id) references professionals(clinic_id,id)
);
create index maria_offers_chat on maria_offers(clinic_id,conversation_id,created_at desc);
alter table maria_offers enable row level security;
revoke all on maria_offers from public,anon,authenticated;
grant all on maria_offers to service_role;

create function finish_maria_turn(p_clinic uuid,p_conversation uuid,p_messages uuid[],p_reply text,p_handoff boolean,p_triage boolean)
returns void language plpgsql set search_path=public as $$
declare paused boolean;
begin
  select is_bot_paused into strict paused from conversations where clinic_id=p_clinic and id=p_conversation for update;
  if not paused then
    if p_reply is not null and length(trim(p_reply))>0 then
      insert into messages(clinic_id,conversation_id,sender,body,external_id)
        values(p_clinic,p_conversation,'maria',left(trim(p_reply),12000),(case when p_handoff then 'handoff:' else 'maria:' end)||p_messages[cardinality(p_messages)]::text)
        on conflict(clinic_id,conversation_id,external_id) do nothing;
    end if;
    if p_handoff then
      update conversations set is_bot_paused=true where clinic_id=p_clinic and id=p_conversation;
      insert into agent_events(clinic_id,action_type,description) values(p_clinic,'handoff','Conversa encaminhada para a equipe');
    end if;
    if p_triage then
      insert into agent_events(clinic_id,action_type,description) values(p_clinic,'triage','Triagem para agendamento concluída');
    end if;
  end if;
  update messages set handled_at=now() where clinic_id=p_clinic and conversation_id=p_conversation
    and sender='patient' and id=any(p_messages);
end;
$$;
revoke all on function finish_maria_turn(uuid,uuid,uuid[],text,boolean,boolean) from public,anon,authenticated;
grant execute on function finish_maria_turn(uuid,uuid,uuid[],text,boolean,boolean) to service_role;

create function clinic_daily_totals(p_clinic uuid,p_day date)
returns table(completed integer,scheduled integer,missed integer,realized numeric)
language sql stable set search_path=public as $$
  with config as (
    select coalesce(settings->>'timezone','America/Sao_Paulo') tz from clinics where id=p_clinic
  )
  select count(*) filter(where status='completed')::integer,
    count(*) filter(where status in ('confirmed','scheduled'))::integer,
    count(*) filter(where status='no_show')::integer,
    coalesce(sum(price) filter(where status='completed'),0)
  from appointments cross join config
  where clinic_id=p_clinic and start_time >= (p_day::timestamp at time zone tz)
    and start_time < ((p_day+1)::timestamp at time zone tz);
$$;
revoke all on function clinic_daily_totals(uuid,date) from public,anon,authenticated;
grant execute on function clinic_daily_totals(uuid,date) to service_role;
