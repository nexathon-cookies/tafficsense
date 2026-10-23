create role phase4_snapshot_reader nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant phase4_snapshot_reader to postgres;
grant usage, create on schema public to phase4_snapshot_reader;

-- The enclosing reader can read only the existing public fixture and synthetic evidence descriptors.
do $$
declare table_name text;
begin
  foreach table_name in array array['demo_traffic_corridors','demo_traffic_segments','demo_traffic_routes',
    'demo_traffic_route_segments','demo_traffic_sources','demo_traffic_observations'] loop
    execute format('grant select on public.%I to phase4_snapshot_reader', table_name);
    execute format('create policy "Phase four reads owned fixture" on public.%I for select to phase4_snapshot_reader using (%s)',
      table_name, case when table_name = 'demo_traffic_corridors' then 'id = ''mangaluru-central-v1''' else 'corridor_id = ''mangaluru-central-v1''' end);
  end loop;
  foreach table_name in array array['public_traffic_reports','reporting_settings'] loop
    execute format('grant select on public.%I to phase4_snapshot_reader', table_name);
    execute format('create policy "Phase four reads public data" on public.%I for select to phase4_snapshot_reader using (true)', table_name);
  end loop;
end;
$$;
grant select (id, segment_id, direction, created_at, provenance) on public.incident_episodes to phase4_snapshot_reader;
create policy "Phase four reads public episodes" on public.incident_episodes for select to phase4_snapshot_reader
  using (exists(select 1 from public.public_traffic_reports r where r.episode_id = incident_episodes.id));
grant select on public.speed_evidence_segments, public.speed_evidence_batches to phase4_snapshot_reader;
create policy "Phase four selects directed run" on public.speed_evidence_segments for select to phase4_snapshot_reader using (true);
create policy "Phase four selects accepted run" on public.speed_evidence_batches for select to phase4_snapshot_reader using (true);
grant select (traversal_id, run_id, segment_id, direction, exited_at, entered_at, accepted_at) on public.completed_traversals to phase4_snapshot_reader;
create policy "Phase four selects completion reference" on public.completed_traversals for select to phase4_snapshot_reader using (true);
grant execute on function public.read_traffic_demo(), public.read_report_assessments(),
  public.project_incident_lifecycle(timestamptz), public.project_completed_traversal(uuid,text,text,timestamptz) to phase4_snapshot_reader;

create function public.read_traffic_phase4()
returns jsonb language sql stable security definer
set search_path = '' set timezone = 'UTC' set lock_timeout = '5s' set statement_timeout = '8s'
as $$
  with traffic as materialized (select public.read_traffic_demo() value),
  clock as (select (value ->> 'read_at')::timestamptz read_at from traffic),
  incidents as (
    select jsonb_build_object(
      'id', row -> 'id', 'segment_id', row -> 'segment_id', 'direction', row -> 'direction',
      'state', case when row ->> 'state' = 'historical' then 'unconfirmed' else row ->> 'state' end,
      'is_current', row -> 'current_context', 'started_at', row -> 'started_at',
      'last_supported_at', row -> 'latest_support_at', 'cleared_at', row -> 'cleared_at', 'recovery_end', row -> 'recovery_end',
      'valid_until', row -> 'valid_until', 'supporting_source_count', row -> 'slow_source_count',
      'recovered_source_count', row -> 'recovery_source_count', 'prior_incident_id', row -> 'prior_cycle_id',
      'report_episode_ids', row -> 'episode_ids', 'provenance', 'simulated', 'cause', 'unknown'
    ) value
    from clock cross join lateral jsonb_array_elements(public.project_incident_lifecycle(clock.read_at)) row
  ), traversals as (
    select (projection.value - 'state' - 'elapsed_seconds') || jsonb_build_object('status', projection.value -> 'state', 'id', completion.traversal_id) value
    from public.demo_traffic_segments segment cross join clock
    left join lateral (
      select s.run_id from public.speed_evidence_segments s join public.speed_evidence_batches b on b.run_id = s.run_id
      where s.segment_id = segment.id and s.direction = segment.direction and b.accepted_at <= clock.read_at
      order by b.accepted_at desc, b.batch_id desc, b.run_id desc limit 1
    ) selected on true
    cross join lateral (select public.project_completed_traversal(selected.run_id, segment.id, segment.direction, clock.read_at) value) projection
    left join lateral (
      select t.traversal_id from public.completed_traversals t
      where t.run_id = selected.run_id and t.segment_id = segment.id and t.direction = segment.direction
      order by t.exited_at desc, t.entered_at desc, t.accepted_at desc, t.traversal_id limit 1
    ) completion on true
    where segment.corridor_id = 'mangaluru-central-v1'
  )
  select jsonb_build_object('traffic', traffic.value,
    'incidents', (select coalesce(jsonb_agg(value order by value ->> 'started_at', value ->> 'id'), '[]'::jsonb) from incidents),
    'traversals', (select coalesce(jsonb_agg(value order by value ->> 'segment_id'), '[]'::jsonb) from traversals))
  from traffic;
$$;
alter function public.read_traffic_phase4() owner to phase4_snapshot_reader;
revoke all on function public.read_traffic_phase4() from public;
grant execute on function public.read_traffic_phase4() to anon, authenticated, service_role, postgres;
revoke create on schema public from phase4_snapshot_reader;
revoke phase4_snapshot_reader from postgres;
