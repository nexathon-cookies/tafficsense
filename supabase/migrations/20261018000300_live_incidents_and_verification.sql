-- Plan 4 (revised) Live Incident Reporting & Server-Enforced Verification Ladder (L1–L4, L6)
-- Ensures PostGIS extension is available for geospatial distance queries.
create extension if not exists postgis;

-- 1. Incidents Table (cluster of reports representing a real-world event)
create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in (
    'accident', 'road_repair', 'festival', 'strike', 'vip_movement',
    'landslide', 'heavy_rain', 'flood', 'signal_failure', 'breakdown',
    'road_closed', 'bridge_maintenance', 'police_restriction', 'fallen_tree',
    'heavy_traffic', 'other', 'unknown'
  )),
  lat double precision not null,
  lng double precision not null,
  first_reported_at timestamptz not null default clock_timestamp(),
  last_confirmed_at timestamptz not null default clock_timestamp(),
  status text not null default 'open' check (status in ('open', 'resolved', 'expired')),
  level text not null default 'L1' check (level in ('L1', 'L2', 'L3', 'L4', 'L5', 'L6')),
  level_reason text not null default 'Reported by commuter (unconfirmed)',
  authority_confirmed_by uuid references public.profiles (id),
  provenance text not null default 'reported' check (provenance in ('reported', 'verified', 'authority'))
);

create index if not exists idx_incidents_status on public.incidents (status);
create index if not exists idx_incidents_lat_lng on public.incidents (lat, lng);

-- 2. Incident Reports Table (individual submissions by users)
create table if not exists public.incident_reports (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents (id) on delete cascade,
  reporter_id uuid not null,
  category text not null,
  lat double precision not null,
  lng double precision not null,
  gps_accuracy_m double precision,
  gps_fix_at timestamptz,
  submitted_at timestamptz not null default clock_timestamp(),
  note text,
  unique (incident_id, reporter_id)
);

create index if not exists idx_incident_reports_incident on public.incident_reports (incident_id);
create index if not exists idx_incident_reports_reporter on public.incident_reports (reporter_id, submitted_at);

-- 3. Audit Log Table
create table if not exists public.incident_audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  actor_id uuid not null references public.profiles (id),
  incident_id uuid not null references public.incidents (id) on delete cascade,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);

-- Enable RLS
alter table public.incidents enable row level security;
alter table public.incident_reports enable row level security;
alter table public.incident_audit_log enable row level security;

-- Public/Authenticated read policies
revoke all on public.incidents, public.incident_reports, public.incident_audit_log from anon, authenticated;

grant select on public.incidents to anon, authenticated;
grant select on public.incident_reports to anon, authenticated;
grant select on public.incident_audit_log to authenticated;

drop policy if exists "Anyone can read incidents" on public.incidents;
create policy "Anyone can read incidents" on public.incidents
  for select to anon, authenticated using (true);

drop policy if exists "Anyone can read reports" on public.incident_reports;
create policy "Anyone can read reports" on public.incident_reports
  for select to anon, authenticated using (true);

drop policy if exists "Authorities read audit log" on public.incident_audit_log;
create policy "Authorities read audit log" on public.incident_audit_log
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'authority'
    )
  );

-- Helper distance calculation on sphere in meters
create or replace function public.meter_distance(
  lat1 double precision, lon1 double precision,
  lat2 double precision, lon2 double precision
) returns double precision
language sql immutable strict
as $$
  select 6371000.0 * 2.0 * asin(sqrt(
    power(sin(radians((lat2 - lat1) / 2.0)), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) *
    power(sin(radians((lon2 - lon1) / 2.0)), 2)
  ));
$$;

-- 4. Function: submit_live_incident_report
-- Clustered incident creation and evaluation
create or replace function public.submit_live_incident_report(
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

  -- 4. Cluster search: find open incident with same category within 300 meters
  select id into target_incident_id
  from public.incidents
  where category = p_category
    and status = 'open'
    and public.meter_distance(lat, lng, p_lat, p_lng) <= 300.0
  order by public.meter_distance(lat, lng, p_lat, p_lng) asc
  limit 1;

  if target_incident_id is null then
    -- Create new open incident
    insert into public.incidents (
      category, lat, lng, first_reported_at, last_confirmed_at, status, level, level_reason
    ) values (
      p_category, p_lat, p_lng, clock_timestamp(), clock_timestamp(), 'open', 'L1', 'Reported by commuter (unconfirmed)'
    )
    returning id into target_incident_id;
  else
    -- Refresh last confirmation timestamp
    update public.incidents
    set last_confirmed_at = clock_timestamp()
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

revoke all on function public.submit_live_incident_report(text, double precision, double precision, double precision, timestamptz, text) from public;
grant execute on function public.submit_live_incident_report(text, double precision, double precision, double precision, timestamptz, text) to authenticated;

-- 5. Function: authority_update_incident
-- Allows traffic authority to confirm (L6) or resolve an incident
create or replace function public.authority_update_incident(
  p_incident_id uuid,
  p_action text -- 'confirm' | 'resolve'
) returns jsonb
language plpgsql
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  caller_id uuid;
  caller_role text;
  target_incident record;
begin
  caller_id := (select auth.uid());
  if caller_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select role into caller_role
  from public.profiles
  where id = caller_id;

  if caller_role is null or caller_role <> 'authority' then
    raise exception 'Authority permission required.' using errcode = '42501';
  end if;

  select * into target_incident
  from public.incidents
  where id = p_incident_id;

  if target_incident.id is null then
    raise exception 'Incident not found.' using errcode = 'P0002';
  end if;

  if p_action = 'confirm' then
    update public.incidents
    set level = 'L6',
        level_reason = 'Officially confirmed by Traffic Authority',
        authority_confirmed_by = caller_id,
        provenance = 'authority',
        last_confirmed_at = clock_timestamp()
    where id = p_incident_id;

    insert into public.incident_audit_log (action, actor_id, incident_id, details)
    values ('confirm_incident', caller_id, p_incident_id, jsonb_build_object('level', 'L6'));

  elsif p_action = 'resolve' then
    update public.incidents
    set status = 'resolved',
        level_reason = 'Cleared and resolved by Traffic Authority',
        last_confirmed_at = clock_timestamp()
    where id = p_incident_id;

    insert into public.incident_audit_log (action, actor_id, incident_id, details)
    values ('resolve_incident', caller_id, p_incident_id, jsonb_build_object('status', 'resolved'));

  else
    raise exception 'Unsupported action. Use confirm or resolve.' using errcode = '22023';
  end if;

  return jsonb_build_object('ok', true, 'action', p_action);
end;
$$;

revoke all on function public.authority_update_incident(uuid, text) from public;
grant execute on function public.authority_update_incident(uuid, text) to authenticated;

-- 6. Function: read_active_live_incidents
-- Reads all active incidents, auto-expiring incidents inactive for > 3 hours
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
  -- Auto-expire open incidents without new confirmation for 3 hours
  update public.incidents
  set status = 'expired',
      level_reason = 'Expired due to inactivity (3 hours without confirmation)'
  where status = 'open'
    and last_confirmed_at < (clock_timestamp() - interval '3 hours');

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
