-- L5 AI Visual Corroboration for live incidents.
-- A reporter who attached a genuine, AI-verified photo may promote their own
-- open incident to L5. Authority-confirmed (L6) incidents are never downgraded.
create or replace function public.apply_incident_photo_verification(
  p_incident_id uuid,
  p_summary text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  caller_id uuid;
  new_reason text;
  affected integer;
begin
  caller_id := (select auth.uid());
  if caller_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  -- Only a reporter of this incident can attach photo evidence to it.
  if not exists (
    select 1 from public.incident_reports
    where incident_id = p_incident_id and reporter_id = caller_id
  ) then
    raise exception 'Only a reporter of this incident can attach photo evidence.' using errcode = '42501';
  end if;

  new_reason := case
    when p_summary is null or length(trim(p_summary)) = 0
      then 'L5 AI Vision corroborated photo evidence'
    else 'L5 AI Vision corroborated: ' || left(trim(p_summary), 140)
  end;

  update public.incidents
  set level = 'L5',
      level_reason = new_reason,
      provenance = 'verified',
      last_confirmed_at = clock_timestamp()
  where id = p_incident_id
    and status = 'open'
    and level <> 'L6';
  get diagnostics affected = row_count;

  return jsonb_build_object('ok', affected > 0, 'level', 'L5', 'level_reason', new_reason);
end;
$$;

revoke all on function public.apply_incident_photo_verification(uuid, text) from public;
grant execute on function public.apply_incident_photo_verification(uuid, text) to authenticated;
