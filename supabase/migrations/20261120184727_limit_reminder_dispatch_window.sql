create or replace function private.reminder_candidates(p_now timestamptz, p_lookahead interval)
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
    and p_now < cl.due_at + interval '5 minutes'
    and p.phone ~ '^[1-9][0-9]{7,14}$' and p.phone is distinct from cl.own_phone
    and not exists (
      select 1 from public.messages m where m.clinic_id = a.clinic_id
        and m.external_id like 'reminder:%' and m.external_id = reminder.key
    )
  order by a.start_time, a.id;
$$;
