create role phase5_snapshot_reader nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant phase5_snapshot_reader, phase4_snapshot_reader, traversal_reader to postgres;
grant usage, create on schema public to phase5_snapshot_reader;

-- Helper grants must be issued while their restricted owner roles are available.
grant execute on function public.read_traffic_phase4(), public.project_completed_traversal(uuid,text,text,timestamptz)
  to phase5_snapshot_reader;
grant select (corridor_id, id, kind, direction) on public.demo_traffic_routes to phase5_snapshot_reader;
grant select (corridor_id, route_id, segment_id, position, direction) on public.demo_traffic_route_segments to phase5_snapshot_reader;
grant select (corridor_id, id, direction, length_m, baseline_seconds, baseline_label) on public.demo_traffic_segments to phase5_snapshot_reader;
create policy "Phase five reads fixed routes" on public.demo_traffic_routes for select to phase5_snapshot_reader
  using (corridor_id = 'mangaluru-central-v1');
create policy "Phase five reads directed membership" on public.demo_traffic_route_segments for select to phase5_snapshot_reader
  using (corridor_id = 'mangaluru-central-v1');
create policy "Phase five reads active baselines" on public.demo_traffic_segments for select to phase5_snapshot_reader
  using (corridor_id = 'mangaluru-central-v1');
grant select (run_id, segment_id, direction, length_m, baseline_seconds, baseline_label) on public.speed_evidence_segments to phase5_snapshot_reader;
grant select (run_id, batch_id, accepted_at) on public.speed_evidence_batches to phase5_snapshot_reader;
create policy "Phase five selects directed run" on public.speed_evidence_segments for select to phase5_snapshot_reader using (true);
create policy "Phase five selects latest accepted batch" on public.speed_evidence_batches for select to phase5_snapshot_reader using (true);
grant select (id, run_id, segment_id, direction) on public.incident_lifecycle_cycles to phase5_snapshot_reader;
create policy "Phase five binds current public cycles" on public.incident_lifecycle_cycles for select to phase5_snapshot_reader using (true);

create function public.read_traffic_phase5()
returns jsonb language sql stable security definer
set search_path = '' set timezone = 'UTC' set lock_timeout = '5s' set statement_timeout = '8s'
as $$
  with phase4 as materialized (select public.read_traffic_phase4() value),
  clock as (select (value->'traffic'->>'read_at')::timestamptz read_at from phase4),
  memberships as materialized (
    select route.id route_id, member.segment_id, member.direction, member.position,
      segment.length_m, segment.baseline_seconds, segment.baseline_label
    from public.demo_traffic_routes route
    join public.demo_traffic_route_segments member on member.corridor_id = route.corridor_id
      and member.route_id = route.id and member.direction = route.direction
    join public.demo_traffic_segments segment on segment.corridor_id = member.corridor_id
      and segment.id = member.segment_id and segment.direction = member.direction
    where route.corridor_id = 'mangaluru-central-v1' and route.direction = 'outbound'
      and ((route.id = 'primary' and route.kind = 'primary') or (route.id = 'alternative' and route.kind = 'alternative'))
  ), selected as materialized (
    select member.*, latest.run_id,
      (latest.length_m, latest.baseline_seconds, latest.baseline_label)
        is not distinct from (member.length_m, member.baseline_seconds, member.baseline_label) as compatible
    from memberships member cross join clock
    left join lateral (
      select s.run_id, s.length_m, s.baseline_seconds, s.baseline_label
      from public.speed_evidence_segments s join public.speed_evidence_batches b on b.run_id = s.run_id
      where s.segment_id = member.segment_id and s.direction = member.direction and b.accepted_at <= clock.read_at
      order by b.accepted_at desc, b.batch_id desc, b.run_id desc limit 1
    ) latest on true
  ), projections as materialized (
    select selected.*, public.project_completed_traversal(selected.run_id, selected.segment_id, selected.direction, clock.read_at) value
    from selected cross join clock
  ), assessment as (
    select case
      when count(distinct route_id) <> 2 then 'no_routes'
      when (select coalesce(jsonb_agg(segment_id order by position), '[]'::jsonb) from memberships where route_id = 'primary') <> jsonb_build_array('primary-west', 'primary-east')
        or (select coalesce(jsonb_agg(segment_id order by position), '[]'::jsonb) from memberships where route_id = 'alternative') <> jsonb_build_array('alternative-west', 'alternative-east')
        then 'incompatible'
      when count(*) filter (where run_id is null) > 0 then 'missing'
      when count(distinct run_id) <> 1 then 'mixed_runs'
      when bool_or(not compatible) or bool_or(value->>'state' = 'incompatible') then 'incompatible'
      when bool_or(value->>'state' = 'invalid') then 'invalid'
      when bool_or(value->>'state' = 'future') then 'future'
      when bool_or(value->>'state' = 'stale') then 'stale'
      when bool_and(value->>'state' = 'available') then 'available'
      else 'missing' end status,
      sum((value->>'elapsed_seconds')::numeric * 1000000) filter (where route_id = 'primary')::bigint primary_duration_us,
      sum((value->>'elapsed_seconds')::numeric * 1000000) filter (where route_id = 'alternative')::bigint alternative_duration_us,
      min((value->>'valid_until')::timestamptz) valid_until
    from projections
  )
  select jsonb_build_object('phase4', phase4.value, 'route_comparison', jsonb_build_object(
    'status', assessment.status, 'primary_route_id', 'primary', 'alternative_route_id', 'alternative', 'direction', 'outbound',
    'primary_segment_ids', (select coalesce(jsonb_agg(segment_id order by position), '[]'::jsonb) from memberships where route_id = 'primary'),
    'alternative_segment_ids', (select coalesce(jsonb_agg(segment_id order by position), '[]'::jsonb) from memberships where route_id = 'alternative'),
    'primary_duration_us', case when assessment.status = 'available' then assessment.primary_duration_us end,
    'alternative_duration_us', case when assessment.status = 'available' then assessment.alternative_duration_us end,
    'savings_us', case when assessment.status = 'available' then assessment.primary_duration_us - assessment.alternative_duration_us end,
    'valid_until', case when assessment.status = 'available' then assessment.valid_until end,
    'supported_incident_ids', (select coalesce(jsonb_agg(incident->'id' order by incident->>'id'), '[]'::jsonb)
      from jsonb_array_elements(phase4.value->'incidents') incident
      join public.incident_lifecycle_cycles cycle on cycle.id = (incident->>'id')::uuid
      where assessment.status = 'available' and incident->>'state' = 'supported' and (incident->>'is_current')::boolean
        and (incident->>'valid_until')::timestamptz > clock.read_at
        and cycle.run_id = (select run_id from selected limit 1)
        and exists (select 1 from memberships member where member.route_id = 'primary'
          and member.segment_id = incident->>'segment_id' and member.direction = incident->>'direction'
          and member.segment_id = cycle.segment_id and member.direction = cycle.direction)),
    'provenance', 'simulated'))
  from phase4 cross join clock cross join assessment;
$$;
alter function public.read_traffic_phase5() owner to phase5_snapshot_reader;
revoke all on function public.read_traffic_phase5() from public;
grant execute on function public.read_traffic_phase5() to anon, authenticated, service_role, postgres;
revoke create on schema public from phase5_snapshot_reader;
revoke phase5_snapshot_reader, phase4_snapshot_reader, traversal_reader from postgres;
