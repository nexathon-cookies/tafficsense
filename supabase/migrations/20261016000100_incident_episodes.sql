-- Assignment order is arrival order, not an observation-time clustering guarantee.
select pg_advisory_xact_lock(72861, 3);
grant traffic_report_executor to postgres;
grant create on schema public to traffic_report_executor;

do $$
begin
  if exists (select 1 from public.public_traffic_reports
    where not isfinite(observed_at) or not isfinite(received_at)
      or not isfinite(observed_at + interval '20 minutes')) then
    raise exception 'Incident backfill requires finite report timestamps';
  end if;
  if (select count(*) from public.public_traffic_reports) > 2000 then
    raise exception 'Incident backfill exceeds the retained report budget';
  end if;
end;
$$;

create table public.incident_episodes (
  id uuid primary key default gen_random_uuid(),
  segment_id text not null,
  direction text not null,
  created_at timestamptz not null default clock_timestamp() check (isfinite(created_at)),
  provenance text not null default 'simulated' check (provenance = 'simulated'),
  assignment_lower timestamptz check (isfinite(assignment_lower)),
  assignment_upper timestamptz check (isfinite(assignment_upper)),
  observed_high_water timestamptz not null check (isfinite(observed_high_water)),
  unique (id, segment_id, direction),
  foreign key (segment_id, direction) references public.report_segment_catalog (id, direction),
  check (assignment_lower is null or assignment_lower <= observed_high_water),
  check (assignment_upper is null or assignment_upper = observed_high_water + interval '20 minutes')
);
create unique index incident_episodes_latest on public.incident_episodes (segment_id, direction)
  where assignment_upper is null;
create unique index incident_episodes_first on public.incident_episodes (segment_id, direction)
  where assignment_lower is null;
create index incident_episodes_intervals on public.incident_episodes (segment_id, direction, assignment_upper);

alter table public.incident_episodes enable row level security;
alter table public.incident_episodes force row level security;
revoke all on public.incident_episodes from public, anon, authenticated, service_role;
grant select (id, segment_id, direction, created_at, provenance) on public.incident_episodes to anon, authenticated;
grant select, delete on public.incident_episodes to service_role;
grant select, insert on public.incident_episodes to traffic_report_executor;
grant update (assignment_upper, observed_high_water) on public.incident_episodes to traffic_report_executor;
create policy "Executor reads episode intervals" on public.incident_episodes
  for select to traffic_report_executor using (true);
create policy "Executor creates episodes" on public.incident_episodes
  for insert to traffic_report_executor with check (true);
create policy "Executor advances latest episode" on public.incident_episodes
  for update to traffic_report_executor using (assignment_upper is null) with check (true);

create function public.assign_incident_episode(p_segment_id text, p_direction text, p_observed_at timestamptz, p_created_at timestamptz)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  episode public.incident_episodes%rowtype;
  boundary timestamptz;
  assigned uuid;
begin
  perform pg_advisory_xact_lock(72861, 3);
  if p_observed_at is null or p_created_at is null or not isfinite(p_observed_at) or not isfinite(p_created_at) then
    raise exception 'Episode assignment requires finite timestamps' using errcode = '22007';
  end if;
  select * into episode from public.incident_episodes
    where segment_id = p_segment_id and direction = p_direction and assignment_upper is not null
      and (assignment_lower is null or p_observed_at >= assignment_lower) and p_observed_at < assignment_upper;
  if found then return episode.id; end if;
  select * into episode from public.incident_episodes
    where segment_id = p_segment_id and direction = p_direction and assignment_upper is null;
  if found then
    boundary := episode.observed_high_water + interval '20 minutes';
    if p_observed_at < boundary then
      update public.incident_episodes set observed_high_water = greatest(observed_high_water, p_observed_at)
        where id = episode.id;
      return episode.id;
    end if;
  end if;
  -- Refuse before freezing: a rejected submission must leave the latest interval intact.
  if (select count(*) from public.incident_episodes) >= 2000 then return null; end if;
  if episode.id is not null then
    update public.incident_episodes set assignment_upper = boundary where id = episode.id;
  end if;
  insert into public.incident_episodes(segment_id, direction, created_at, assignment_lower, observed_high_water)
    values (p_segment_id, p_direction, p_created_at, boundary, p_observed_at) returning id into assigned;
  return assigned;
end;
$$;
alter function public.assign_incident_episode(text, text, timestamptz, timestamptz) owner to traffic_report_executor;
revoke all on function public.assign_incident_episode(text, text, timestamptz, timestamptz)
  from public, anon, authenticated, service_role;
-- Maintenance lint and transactional boundary checks do not inherit the executor role.
grant execute on function public.assign_incident_episode(text, text, timestamptz, timestamptz) to postgres;

alter table public.public_traffic_reports add column episode_id uuid;
do $$
declare report record; assigned uuid;
begin
  for report in select id, segment_id, direction, observed_at, received_at
    from public.public_traffic_reports order by received_at, id
  loop
    assigned := public.assign_incident_episode(report.segment_id, report.direction, report.observed_at, report.received_at);
    if assigned is null then raise exception 'Incident backfill exceeds the episode metadata budget'; end if;
    update public.public_traffic_reports set episode_id = assigned where id = report.id;
  end loop;
end;
$$;
alter table public.public_traffic_reports alter column episode_id set not null;
alter table public.public_traffic_reports add constraint public_traffic_reports_episode_segment_fkey
  foreign key (episode_id, segment_id, direction) references public.incident_episodes (id, segment_id, direction);
create index public_traffic_reports_episode on public.public_traffic_reports (episode_id);

create function public.preserve_report_episode()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if (new.episode_id, new.segment_id, new.direction) is distinct from (old.episode_id, old.segment_id, old.direction) then
    raise exception 'Report episode membership is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.preserve_report_episode() from public, anon, authenticated, service_role;
create trigger preserve_report_episode before update of episode_id, segment_id, direction on public.public_traffic_reports
  for each row execute function public.preserve_report_episode();

create policy "Public nonempty episodes" on public.incident_episodes for select to anon, authenticated using (
  exists (select 1 from public.public_traffic_reports r where r.episode_id = incident_episodes.id)
);

create or replace function public.submit_traffic_report(p_input jsonb)
returns jsonb
language plpgsql security definer set search_path = '' set lock_timeout = '5s' set statement_timeout = '8s'
as $$
declare
  v_source_id uuid;
  v_request_id uuid;
  observation timestamptz;
  receipt timestamptz;
  source_status text;
  field text;
  existing public.traffic_reports_private%rowtype;
  projection public.public_traffic_reports%rowtype;
  v_public_id uuid;
  v_episode_id uuid;
begin
  if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text) > 2048 then
    return jsonb_build_object('status', 'invalid');
  end if;
  if p_input - array['source_id', 'request_id', 'segment_id', 'direction', 'category', 'observed_at'] <> '{}'::jsonb then
    return jsonb_build_object('status', 'invalid');
  end if;
  foreach field in array array['source_id', 'request_id', 'segment_id', 'direction', 'category', 'observed_at'] loop
    if jsonb_typeof(p_input -> field) is distinct from 'string' then return jsonb_build_object('status', 'invalid'); end if;
  end loop;
  if (p_input ->> 'source_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or (p_input ->> 'request_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or (p_input ->> 'segment_id') !~ '^[a-z0-9][a-z0-9-]{0,79}$'
    or p_input ->> 'direction' not in ('outbound', 'inbound')
    or p_input ->> 'category' not in ('accident', 'road_repair', 'flood', 'landslide', 'festival', 'strike', 'vip_movement', 'heavy_traffic', 'road_closed', 'other', 'unknown')
    or (p_input ->> 'observed_at') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' then
    return jsonb_build_object('status', 'invalid');
  end if;
  begin
    v_source_id := (p_input ->> 'source_id')::uuid;
    v_request_id := (p_input ->> 'request_id')::uuid;
    observation := (p_input ->> 'observed_at')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then
    return jsonb_build_object('status', 'invalid');
  end;
  if to_char(observation at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') <> p_input ->> 'observed_at' then
    return jsonb_build_object('status', 'invalid');
  end if;
  perform pg_advisory_xact_lock(72861, 3);
  source_status := public.report_source_status(v_source_id);
  if source_status <> 'ready' then return jsonb_build_object('status', source_status); end if;
  select r.* into existing from public.traffic_reports_private r where r.source_id = v_source_id and r.request_id = v_request_id;
  if found then
    if existing.canonical_input <> p_input then return jsonb_build_object('status', 'conflict'); end if;
    select * into projection from public.public_traffic_reports where id = existing.public_id;
    return jsonb_build_object('status', 'accepted', 'report', to_jsonb(projection), 'replayed', true);
  end if;
  receipt := clock_timestamp();
  if observation <= receipt - interval '20 minutes' or observation > receipt then return jsonb_build_object('status', 'invalid'); end if;
  if not exists (select 1 from public.report_segment_catalog c join public.demo_traffic_segments s
    on s.corridor_id = c.corridor_id and s.id = c.id and s.direction = c.direction
    where c.id = p_input ->> 'segment_id' and c.direction = p_input ->> 'direction') then
    return jsonb_build_object('status', 'unavailable_segment');
  end if;
  if (select count(*) from public.traffic_reports_private) >= 2000
    or (select count(*) from public.traffic_reports_private where received_at > receipt - interval '1 hour') >= 300
    or (select count(*) from public.traffic_reports_private r where r.source_id = v_source_id
      and received_at > receipt - interval '15 minutes') >= 5 then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  v_episode_id := public.assign_incident_episode(p_input ->> 'segment_id', p_input ->> 'direction', observation, receipt);
  if v_episode_id is null then return jsonb_build_object('status', 'rate_limited'); end if;
  v_public_id := gen_random_uuid();
  insert into public.traffic_reports_private (source_id, request_id, public_id, canonical_input, received_at)
    values (v_source_id, v_request_id, v_public_id, p_input, receipt);
  insert into public.public_traffic_reports (id, episode_id, segment_id, direction, category, observed_at, received_at)
    values (v_public_id, v_episode_id, p_input ->> 'segment_id', p_input ->> 'direction', p_input ->> 'category', observation, receipt)
    returning * into projection;
  return jsonb_build_object('status', 'accepted', 'report', to_jsonb(projection), 'replayed', false);
exception when lock_not_available then
  return jsonb_build_object('status', 'denied');
end;
$$;
-- get_report_acknowledgement already returns to_jsonb(public_traffic_reports%rowtype).

create or replace function public.cleanup_traffic_reports(p_source_ids uuid[] default null)
returns jsonb
language plpgsql security invoker set search_path = '' set lock_timeout = '5s'
as $$
declare removed integer;
begin
  if cardinality(p_source_ids) > 100 then return jsonb_build_object('status', 'invalid'); end if;
  perform pg_advisory_xact_lock(72861, 3);
  if p_source_ids is null and (select enabled from public.reporting_settings where id) then
    return jsonb_build_object('status', 'disabled_required');
  end if;
  delete from public.report_sources where p_source_ids is null or id = any(p_source_ids);
  get diagnostics removed = row_count;
  if p_source_ids is null then delete from public.incident_episodes; end if;
  return jsonb_build_object('status', 'ready', 'sources_removed', removed);
end;
$$;

create or replace function public.read_traffic_demo()
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'read_at', statement_timestamp(),
    'reporting_enabled', coalesce((select enabled from public.reporting_settings where id), false),
    'report_assessments', public.read_report_assessments(),
    'incident_episodes', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', e.id, 'segment_id', e.segment_id, 'direction', e.direction, 'created_at', e.created_at,
      'first_observed_at', e.first_observed_at, 'last_observed_at', e.last_observed_at,
      'report_count', e.report_count, 'provenance', e.provenance
    ) order by e.created_at, e.id), '[]'::jsonb) from (
      select episode.id, episode.segment_id, episode.direction, episode.created_at, episode.provenance,
        min(r.observed_at) as first_observed_at, max(r.observed_at) as last_observed_at, count(*) as report_count
      from public.incident_episodes episode
      join public.public_traffic_reports r on r.episode_id = episode.id
        and r.segment_id = episode.segment_id and r.direction = episode.direction
      join public.demo_traffic_segments s on s.id = episode.segment_id and s.direction = episode.direction
        and s.corridor_id = 'mangaluru-central-v1'
      group by episode.id, episode.segment_id, episode.direction, episode.created_at, episode.provenance
    ) e),
    'reports', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'episode_id', r.episode_id, 'segment_id', r.segment_id, 'direction', r.direction, 'category', r.category,
      'observed_at', r.observed_at, 'received_at', r.received_at,
      'provenance', r.provenance, 'location_provenance', r.location_provenance
    ) order by r.received_at, r.id), '[]'::jsonb)
      from public.public_traffic_reports r join public.demo_traffic_segments s
        on s.id = r.segment_id and s.direction = r.direction and s.corridor_id = 'mangaluru-central-v1'),
    'fixture', (
      select jsonb_build_object(
        'corridor', jsonb_build_object(
          'id', c.id, 'name', c.name, 'provenance', c.provenance,
          'geometry_note', c.geometry_note, 'scenario', c.scenario, 'anchor_at', c.anchor_at
        ),
        'segments', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', s.id, 'name', s.name, 'direction', s.direction, 'geometry', s.geometry,
            'length_m', s.length_m, 'baseline_seconds', s.baseline_seconds, 'baseline_label', s.baseline_label
          ) order by s.id), '[]'::jsonb)
          from public.demo_traffic_segments s where s.corridor_id = c.id
        ),
        'routes', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', r.id, 'name', r.name, 'kind', r.kind, 'direction', r.direction
          ) order by r.id), '[]'::jsonb)
          from public.demo_traffic_routes r where r.corridor_id = c.id
        ),
        'route_segments', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'route_id', r.route_id, 'segment_id', r.segment_id, 'position', r.position, 'direction', r.direction
          ) order by r.route_id, r.position), '[]'::jsonb)
          from public.demo_traffic_route_segments r where r.corridor_id = c.id
        ),
        'sources', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', s.id, 'segment_id', s.segment_id, 'label', s.label
          ) order by s.id), '[]'::jsonb)
          from public.demo_traffic_sources s where s.corridor_id = c.id
        ),
        'observations', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'segment_id', o.segment_id, 'source_id', o.source_id,
            'observed_at', o.observed_at, 'speed_kph', o.speed_kph
          ) order by o.observed_at, o.segment_id, o.source_id), '[]'::jsonb)
          from public.demo_traffic_observations o where o.corridor_id = c.id
        )
      )
      from public.demo_traffic_corridors c where c.id = 'mangaluru-central-v1'
    )
  );
$$;
revoke create on schema public from traffic_report_executor;
revoke traffic_report_executor from postgres;
