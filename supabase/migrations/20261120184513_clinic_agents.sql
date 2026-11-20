create function private.set_maria_activation_time()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.settings->'maria_enabled' = 'true'::jsonb then
    if not exists (
      select 1 from public.appointment_tags t
      where t.clinic_id = new.id and t.id::text = new.settings->>'maria_booking_tag_id'
    ) then
      raise exception 'Selecione uma etiqueta de agendamento desta clínica para ativar a Maria.';
    end if;
    if tg_op = 'UPDATE' and old.settings->'maria_enabled' = 'true'::jsonb
       and old.settings ? 'maria_enabled_since' then
      new.settings := jsonb_set(new.settings, '{maria_enabled_since}', old.settings->'maria_enabled_since');
    else
      new.settings := jsonb_set(new.settings, '{maria_enabled_since}', to_jsonb(clock_timestamp()));
    end if;
  else
    new.settings := new.settings - 'maria_enabled_since';
  end if;
  return new;
end;
$$;
revoke all on function private.set_maria_activation_time() from public, anon, authenticated;
create trigger set_maria_activation_time
  before insert or update of settings on public.clinics
  for each row execute function private.set_maria_activation_time();

create function public.update_clinic_agent_settings(p_clinic uuid, p_settings jsonb)
returns jsonb language sql set search_path = '' as $$
  update public.clinics set settings = settings || p_settings
  where id = p_clinic and jsonb_typeof(p_settings) = 'object'
  returning settings;
$$;
revoke all on function public.update_clinic_agent_settings(uuid,jsonb) from public, anon;
grant execute on function public.update_clinic_agent_settings(uuid,jsonb) to authenticated;

create index inbound_waiting_by_clinic on public.messages(clinic_id, created_at, conversation_id)
  where sender = 'patient' and handled_at is null;

create function public.maria_pending_chats(p_pilot_clinic uuid, p_pilot_phone text, p_pilot_since timestamptz)
returns table(clinic_id uuid, conversation_id uuid, active_since timestamptz)
language sql stable set search_path = '' as $$
  with enabled as (
    select cl.id, case when cl.settings->'maria_enabled' = 'true'::jsonb
      then (cl.settings->>'maria_enabled_since')::timestamptz else p_pilot_since end as since,
      not (cl.settings ? 'maria_enabled') as pilot
    from public.clinics cl
    join public.whatsapp_sessions ws on ws.clinic_id = cl.id and ws.enabled and ws.status = 'connected'
    where cl.settings->'maria_enabled' = 'true'::jsonb
       or (cl.id = p_pilot_clinic and not (cl.settings ? 'maria_enabled'))
  )
  select e.id, m.conversation_id, e.since
  from enabled e
  join public.messages m on m.clinic_id = e.id and m.created_at >= e.since
  join public.conversations c on c.clinic_id = m.clinic_id and c.id = m.conversation_id
  where m.sender = 'patient' and m.handled_at is null
    and c.remote_jid ~ '^[0-9]+@(s\.whatsapp\.net|lid)$'
    and (not e.pilot or (c.phone = p_pilot_phone and
      (c.remote_jid = p_pilot_phone || '@s.whatsapp.net' or c.remote_jid ~ '^[0-9]+@lid$')))
  group by e.id, m.conversation_id, e.since
  order by min(m.created_at), m.conversation_id
  limit 40;
$$;
revoke all on function public.maria_pending_chats(uuid,text,timestamptz) from public, anon, authenticated;
grant execute on function public.maria_pending_chats(uuid,text,timestamptz) to service_role;

create unique index outbound_reminder_key on public.messages(clinic_id, external_id)
  where external_id like 'reminder:%';
create index conversations_by_phone on public.conversations(clinic_id, phone, updated_at desc);

create function private.reminder_key(p_appointment uuid, p_start timestamptz)
returns text language sql immutable strict set search_path = '' as $$
  select 'reminder:' || p_appointment::text || ':' || (extract(epoch from p_start) * 1000000)::bigint;
$$;

create function private.reminder_clinics(p_now timestamptz)
returns table(clinic_id uuid, clinic_name text, own_phone text, tz text, due_at timestamptz, end_at timestamptz)
language sql stable set search_path = '' as $$
  select cl.id, cl.name, ws.phone_number, zone.tz,
    ((p_now at time zone zone.tz)::date + time '08:00') at time zone zone.tz,
    ((p_now at time zone zone.tz)::date + 1)::timestamp at time zone zone.tz
  from public.clinics cl
  join public.whatsapp_sessions ws on ws.clinic_id = cl.id and ws.enabled
  left join pg_catalog.pg_timezone_names named on named.name = cl.settings->>'timezone'
  cross join lateral (select coalesce(named.name, 'America/Sao_Paulo') as tz) zone
  where cl.settings->'appointment_reminders_enabled' = 'true'::jsonb;
$$;

create function private.reminder_candidates(p_now timestamptz, p_lookahead interval)
returns table(clinic_id uuid, patient_id uuid, phone text, message_key text, body text)
language sql stable set search_path = '' as $$
  select cl.clinic_id, p.id, p.phone, reminder.key,
    format('Olá! Aqui é a equipe da %s. Passando para lembrar que sua consulta é hoje, %s, às %s.',
      cl.clinic_name, to_char(a.start_time at time zone cl.tz, 'DD/MM/YYYY'),
      to_char(a.start_time at time zone cl.tz, 'HH24:MI'))
  from private.reminder_clinics(p_now) cl
  join public.appointments a on a.clinic_id = cl.clinic_id
    and a.status in ('scheduled','confirmed') and a.start_time >= cl.due_at and a.start_time < cl.end_at
    and (a.start_time > p_now or (a.start_time = cl.due_at and p_now < cl.due_at + interval '2 minutes'))
  join public.patients p on p.clinic_id = a.clinic_id and p.id = a.patient_id
  cross join lateral (select private.reminder_key(a.id, a.start_time) as key) reminder
  where cl.due_at <= p_now + p_lookahead
    and p.phone ~ '^[1-9][0-9]{7,14}$' and p.phone is distinct from cl.own_phone
    and not exists (
      select 1 from public.messages m where m.clinic_id = a.clinic_id
        and m.external_id like 'reminder:%' and m.external_id = reminder.key
    )
  order by a.start_time, a.id;
$$;

create function private.enqueue_appointment_reminders(p_now timestamptz)
returns integer language plpgsql set search_path = '' as $$
declare
  due record;
  thread uuid;
  queued integer := 0;
begin
  for due in select * from private.reminder_candidates(p_now, interval '0 minutes') limit 200 loop
    select c.id into thread from public.conversations c
    where c.clinic_id = due.clinic_id and c.phone = due.phone
      and (c.patient_id is null or c.patient_id = due.patient_id)
      and (c.remote_jid = due.phone || '@s.whatsapp.net' or c.remote_jid ~ '^[0-9]+@lid$')
    order by c.updated_at desc, c.id limit 1;
    if thread is null then
      insert into public.conversations as c(clinic_id, remote_jid, phone, patient_id)
      values(due.clinic_id, due.phone || '@s.whatsapp.net', due.phone, due.patient_id)
      on conflict(clinic_id, remote_jid) do update
        set phone = excluded.phone, patient_id = excluded.patient_id
      where (c.phone is null or c.phone = excluded.phone)
        and (c.patient_id is null or c.patient_id = excluded.patient_id)
      returning c.id into thread;
    end if;
    if thread is not null then
      insert into public.messages(clinic_id, conversation_id, external_id, sender, body)
      values(due.clinic_id, thread, due.message_key, 'human', due.body)
      on conflict do nothing;
      if found then
        queued := queued + 1;
        update public.conversations set updated_at = greatest(updated_at, p_now)
        where clinic_id = due.clinic_id and id = thread;
      end if;
    end if;
  end loop;
  return queued;
end;
$$;

create function public.appointment_reminder_current(p_clinic uuid, p_message uuid, p_now timestamptz default now())
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.messages m
    join public.conversations c on c.clinic_id = m.clinic_id and c.id = m.conversation_id
    join public.appointments a on a.clinic_id = m.clinic_id and a.id = case
      when m.external_id ~ '^reminder:[0-9a-f-]{36}:[0-9]+$'
      then split_part(m.external_id, ':', 2)::uuid end
    join public.patients p on p.clinic_id = a.clinic_id and p.id = a.patient_id
    join private.reminder_clinics(p_now) cl on cl.clinic_id = m.clinic_id
    where m.clinic_id = p_clinic and m.id = p_message and m.sender = 'human'
      and m.external_id = private.reminder_key(a.id, a.start_time)
      and a.status in ('scheduled','confirmed') and p.phone = c.phone and p.phone is distinct from cl.own_phone
      and (c.patient_id is null or c.patient_id = p.id)
      and (c.remote_jid = p.phone || '@s.whatsapp.net' or c.remote_jid ~ '^[0-9]+@lid$')
      and cl.due_at <= p_now and a.start_time >= cl.due_at and a.start_time < cl.end_at
      and (a.start_time > p_now or (a.start_time = cl.due_at and p_now < cl.due_at + interval '2 minutes'))
  );
$$;

revoke all on function private.reminder_key(uuid,timestamptz), private.reminder_clinics(timestamptz),
  private.reminder_candidates(timestamptz,interval), private.enqueue_appointment_reminders(timestamptz)
  from public, anon, authenticated;
revoke all on function public.appointment_reminder_current(uuid,uuid,timestamptz) from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.reminder_key(uuid,timestamptz), private.reminder_clinics(timestamptz) to service_role;
grant execute on function public.appointment_reminder_current(uuid,uuid,timestamptz) to service_role;
