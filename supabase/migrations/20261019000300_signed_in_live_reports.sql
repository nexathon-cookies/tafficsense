-- Anonymous browser sessions cannot establish independent corroboration.
-- Keep the existing incident implementation private and wrap it with an
-- authentication boundary so direct RPC calls cannot bypass the UI rule.

delete from public.incident_reports report
using auth.users account
where account.id = report.reporter_id
  and account.is_anonymous;

alter function public.submit_live_incident_report(text, double precision, double precision, double precision, timestamptz, text)
  rename to submit_live_incident_report_internal;

revoke all on function public.submit_live_incident_report_internal(text, double precision, double precision, double precision, timestamptz, text)
  from public, anon, authenticated;

create function public.submit_live_incident_report(
  p_category text,
  p_lat double precision,
  p_lng double precision,
  p_gps_accuracy_m double precision default null,
  p_gps_fix_at timestamptz default null,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
set timezone = 'UTC'
as $$
begin
  if (select auth.uid()) is null or coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'A signed-in commuter account is required to submit an incident.' using errcode = '42501';
  end if;

  return public.submit_live_incident_report_internal(
    p_category,
    p_lat,
    p_lng,
    p_gps_accuracy_m,
    p_gps_fix_at,
    p_note
  );
end;
$$;

revoke all on function public.submit_live_incident_report(text, double precision, double precision, double precision, timestamptz, text)
  from public;
grant execute on function public.submit_live_incident_report(text, double precision, double precision, double precision, timestamptz, text)
  to authenticated;
