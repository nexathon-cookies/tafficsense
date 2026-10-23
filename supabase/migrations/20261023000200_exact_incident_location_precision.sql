-- Ensure incident locations retain exact coordinates and use tight road-level clustering (50m)
create or replace function public.submit_live_incident_report_internal(
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
declare
  caller_id uuid;
  recent_count integer;
  target_incident_id uuid;
  target_incident record;
  distinct_reporters integer;
  has_valid_gps boolean;
  computed_level text := 'L1';
  computed_reason text := 'Report submitted by commuter (unconfirmed)';
begin
  caller_id := (select auth.uid());
  if caller_id is null then
    raise exception 'Authentication required to report an incident.' using errcode = '42501';
  end if;

  -- 1. Bounds check: must be inside Mangaluru service area (74.70 to 75.05 lng, 12.75 to 13.05 lat)
  if p_lng < 74.70 or p_lng > 75.05 or p_lat < 12.75 or p_lat > 13.05 then
    raise exception 'Location is outside the supported Mangaluru service area.' using errcode = '22023';
  end if;

  -- 2. Category allowlist check
  if p_category not in (
    'accident', 'road_repair', 'festival', 'strike', 'vip_movement',
    'landslide', 'heavy_rain', 'flood', 'signal_failure', 'breakdown',
    'road_closed', 'bridge_maintenance', 'police_restriction', 'fallen_tree',
    'heavy_traffic', 'other', 'unknown'
  ) then
    raise exception 'Invalid incident category.' using errcode = '22023';
  end if;

  -- 3. Rate limit check: at most 5 reports per hour per user
  select count(*) into recent_count
  from public.incident_reports
  where reporter_id = caller_id
    and submitted_at > (clock_timestamp() - interval '1 hour');

  if recent_count >= 5 then
    raise exception 'Rate limit exceeded: maximum 5 reports per hour.' using errcode = 'P0001';
  end if;

  -- 4. Cluster search: find open incident with same category within 50 meters (road/intersection level)
  select id into target_incident_id
  from public.incidents
  where category = p_category
    and status = 'open'
    and public.meter_distance(lat, lng, p_lat, p_lng) <= 50.0
  order by public.meter_distance(lat, lng, p_lat, p_lng) asc
  limit 1;

  if target_incident_id is null then
    -- Create new open incident at exact reported coordinates
    insert into public.incidents (
      category, lat, lng, first_reported_at, last_confirmed_at, status, level, level_reason
    ) values (
      p_category, p_lat, p_lng, clock_timestamp(), clock_timestamp(), 'open', 'L1', 'Reported by commuter (unconfirmed)'
    )
    returning id into target_incident_id;
  else
    -- Refresh last confirmation timestamp and update coordinates to current report location
    update public.incidents
    set last_confirmed_at = clock_timestamp(),
        lat = p_lat,
        lng = p_lng
    where id = target_incident_id;
  end if;

  -- 5. Insert individual report (unique per reporter per incident)
  insert into public.incident_reports (
    incident_id, reporter_id, category, lat, lng, gps_accuracy_m, gps_fix_at, submitted_at, note
  ) values (
    target_incident_id, caller_id, p_category, p_lat, p_lng, p_gps_accuracy_m, p_gps_fix_at, clock_timestamp(), p_note
  )
  on conflict (incident_id, reporter_id) do update set
    lat = excluded.lat,
    lng = excluded.lng,
    gps_accuracy_m = excluded.gps_accuracy_m,
    gps_fix_at = excluded.gps_fix_at,
    submitted_at = clock_timestamp(),
    note = coalesce(excluded.note, public.incident_reports.note);

  -- 6. Evaluate Verification Ladder (L1 -> L2 -> L3)
  select * into target_incident
  from public.incidents
  where id = target_incident_id;

  -- If already authority confirmed, preserve L6
  if target_incident.level = 'L6' then
    return jsonb_build_object(
      'ok', true,
      'incident_id', target_incident_id,
      'level', 'L6',
      'level_reason', target_incident.level_reason
    );
  end if;

  -- Count distinct reporters within the last 15 minutes
  select count(distinct reporter_id) into distinct_reporters
  from public.incident_reports
  where incident_id = target_incident_id
    and submitted_at >= (clock_timestamp() - interval '15 minutes');

  -- Check if any reporter has verified GPS fix:
  -- under 2 min old, accuracy <= 50m, within 200m of incident
  select exists (
    select 1 from public.incident_reports
    where incident_id = target_incident_id
      and gps_fix_at is not null
      and gps_fix_at >= (submitted_at - interval '2 minutes')
      and gps_accuracy_m is not null
      and gps_accuracy_m <= 50.0
      and public.meter_distance(lat, lng, target_incident.lat, target_incident.lng) <= 200.0
  ) into has_valid_gps;

  if distinct_reporters >= 3 then
    computed_level := 'L3';
    computed_reason := format('Verified by %s independent commuters within 15 minutes', distinct_reporters);
  elsif has_valid_gps then
    computed_level := 'L2';
    computed_reason := 'Location verified by high-accuracy device GPS (<= 50m)';
  else
    computed_level := 'L1';
    computed_reason := 'Report submitted by commuter (unconfirmed)';
  end if;

  update public.incidents
  set level = computed_level,
      level_reason = computed_reason,
      provenance = case when computed_level in ('L3', 'L4', 'L6') then 'verified' else 'reported' end
  where id = target_incident_id;

  return jsonb_build_object(
    'ok', true,
    'incident_id', target_incident_id,
    'level', computed_level,
    'level_reason', computed_reason,
    'distinct_reporters', distinct_reporters
  );
end;
$$;
