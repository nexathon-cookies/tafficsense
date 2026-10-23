-- Migration: Extend live incident expiration to 7 days for local persistence,
-- and restore incidents that were prematurely expired by the 3-hour timer.

create or replace function public.read_active_live_incidents()
returns jsonb
language plpgsql
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  result jsonb;
begin
  -- Auto-expire open incidents without new confirmation for 7 days (instead of aggressive 3 hours)
  update public.incidents
  set status = 'expired',
      level_reason = 'Expired due to inactivity (7 days without confirmation)'
  where status = 'open'
    and last_confirmed_at < (clock_timestamp() - interval '7 days');

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id,
    'category', i.category,
    'lat', i.lat,
    'lng', i.lng,
    'status', i.status,
    'level', i.level,
    'level_reason', i.level_reason,
    'first_reported_at', i.first_reported_at,
    'last_confirmed_at', i.last_confirmed_at,
    'provenance', i.provenance,
    'photo_data_url', i.photo_data_url,
    'photo_confidence', i.photo_confidence,
    'report_count', (
      select count(*) from public.incident_reports r where r.incident_id = i.id
    )
  ) order by i.last_confirmed_at desc), '[]'::jsonb)
  into result
  from public.incidents i
  where i.status = 'open';

  return result;
end;
$$;

revoke all on function public.read_active_live_incidents() from public;
grant execute on function public.read_active_live_incidents() to anon, authenticated;

-- Restore incidents that were auto-expired under the old 3-hour rule in the last 7 days
update public.incidents
set status = 'open',
    level_reason = 'Restored active status for persistent local testing'
where status = 'expired'
  and level_reason like 'Expired due to inactivity%'
  and last_confirmed_at > (clock_timestamp() - interval '7 days');
