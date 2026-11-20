create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create function private.run_appointment_reminders(p_worker_health_url text)
returns integer language plpgsql set search_path = '' as $$
declare
  current_timepoint timestamptz := clock_timestamp();
  queued integer;
begin
  -- Wake the worker shortly before 08:00, or when pending reminders still need it.
  if not exists (select 1 from public.worker_lease w where w.expires_at > current_timepoint)
    and (
      exists (select 1 from private.reminder_candidates(current_timepoint, interval '3 minutes'))
      or exists (
        select 1 from public.messages m
        where m.delivery in ('queued','processing') and m.external_id like 'reminder:%'
          and m.created_at >= current_timepoint - interval '1 day'
          and public.appointment_reminder_current(m.clinic_id, m.id, current_timepoint)
      )
    ) then
    perform net.http_get(url := p_worker_health_url, timeout_milliseconds := 55000);
  end if;
  queued := private.enqueue_appointment_reminders(current_timepoint);
  return queued;
end;
$$;
revoke all on function private.run_appointment_reminders(text) from public, anon, authenticated;
