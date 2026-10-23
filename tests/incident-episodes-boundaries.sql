-- Run serially in Docker psql. All mutations, including optional migration rehearsal, roll back.
-- Before applying the migration: psql -v episodes_backfill=true -f this-file.
\if :{?episodes_backfill}
\else
\set episodes_backfill false
\endif
begin;
set local statement_timeout = '60s';
set local lock_timeout = '5s';
select pg_advisory_xact_lock(72861, 3);

create function pg_temp.episode_assert(p_ok boolean, p_message text)
returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception '%', p_message; end if;
end;
$$;

\if :episodes_backfill
select pg_temp.episode_assert(to_regclass('public.incident_episodes') is null,
  'Backfill rehearsal requires the pre-migration schema; do not drop deployed episode data');
create temp table episode_backfill_case (segment text, source_id uuid, user_id uuid);
insert into episode_backfill_case values ('episode-backfill-' || gen_random_uuid(), gen_random_uuid(), gen_random_uuid());
insert into public.report_segment_catalog(id, corridor_id, direction)
  select segment, 'mangaluru-central-v1', 'outbound' from episode_backfill_case;
insert into auth.users(id, is_anonymous) select user_id, false from episode_backfill_case;
insert into public.report_sources(id, user_id, kind) select source_id, user_id, 'account' from episode_backfill_case;
create temp table episode_backfill_ids (id uuid, observation timestamptz, receipt timestamptz, expected_group integer);
-- Receipt ties are resolved by public report id, not observation order.
insert into episode_backfill_ids values
  ('eeeeeeee-0000-4000-8000-000000000001', '2026-10-01T00:00:00Z', '2026-10-01T01:00:00Z', 1),
  ('eeeeeeee-0000-4000-8000-000000000002', '2026-10-01T00:20:00Z', '2026-10-01T01:00:00Z', 2),
  ('eeeeeeee-0000-4000-8000-000000000003', '2026-10-01T00:19:59.999999Z', '2026-10-01T01:00:01Z', 1),
  ('eeeeeeee-0000-4000-8000-000000000004', '2026-09-30T23:00:00Z', '2026-10-01T01:00:02Z', 1);
insert into public.traffic_reports_private(public_id, source_id, request_id, canonical_input, received_at)
  select i.id, c.source_id, gen_random_uuid(), jsonb_build_object('test', 'backfill-preservation'), i.receipt
  from episode_backfill_ids i cross join episode_backfill_case c;
insert into public.public_traffic_reports(id, segment_id, direction, category, observed_at, received_at)
  select i.id, c.segment, 'outbound', 'unknown', i.observation, i.receipt
  from episode_backfill_ids i cross join episode_backfill_case c;
create temp table episode_saved_public as select id, to_jsonb(r) as original from public.public_traffic_reports r;
create temp table episode_saved_private as select id, to_jsonb(r) as original from public.traffic_reports_private r;
\ir ../supabase/migrations/20261016000100_incident_episodes.sql
select pg_temp.episode_assert(not exists (
  select 1 from episode_saved_public s full join public.public_traffic_reports r using(id)
  where s.original is distinct from to_jsonb(r) - 'episode_id'
), 'Backfill must preserve every original public field and row');
select pg_temp.episode_assert(not exists (
  select 1 from episode_saved_private s full join public.traffic_reports_private r using(id)
  where s.original is distinct from to_jsonb(r)
), 'Backfill must preserve every private field and row');
select pg_temp.episode_assert((select count(distinct r.episode_id) = 2
  from episode_backfill_ids i join public.public_traffic_reports r using(id)), 'Backfill must split at the exact gap');
select pg_temp.episode_assert(not exists (
  select i.expected_group from episode_backfill_ids i join public.public_traffic_reports r using(id)
  group by i.expected_group having count(distinct r.episode_id) <> 1
), 'Backfill must use received_at,id and frozen late-arrival membership');
select pg_temp.episode_assert((select count(*) = 1 from public.incident_episodes e
  join episode_backfill_case c on c.segment = e.segment_id where e.assignment_lower is null
  and e.assignment_upper = '2026-10-01T00:20:00Z' and e.observed_high_water = '2026-10-01T00:00:00Z'),
  'Backfill must not move the historical high-water mark for late members');
\else
select pg_temp.episode_assert(to_regclass('public.incident_episodes') is not null, 'Apply the coordinated migration before boundary tests');
create temp table episode_case (segment text, inbound text, fresh text, source_id uuid, user_id uuid);
insert into episode_case values ('episode-boundary-' || gen_random_uuid(), 'episode-inbound-' || gen_random_uuid(),
  'episode-fresh-' || gen_random_uuid(), gen_random_uuid(), gen_random_uuid());
select pg_temp.episode_assert((select count(*) < 1980 from public.incident_episodes), 'Boundary tests need metadata capacity; unrelated data is retained');
select pg_temp.episode_assert((select count(*) < 1988 from public.traffic_reports_private), 'Boundary tests need report capacity; unrelated data is retained');
select pg_temp.episode_assert((select count(*) < 298 from public.traffic_reports_private where received_at > clock_timestamp() - interval '1 hour'),
  'Boundary tests need two rolling-hour admission slots; unrelated data is retained');
insert into public.demo_traffic_corridors(id, name, provenance, geometry_note, scenario, anchor_at)
  values ('mangaluru-central-v1', 'Synthetic boundary fixture', 'simulated', 'Test-only schematic', 'normal', '2026-10-15T04:00:00Z')
  on conflict (id) do nothing;
insert into public.report_segment_catalog(id, corridor_id, direction)
  select segment, 'mangaluru-central-v1', 'outbound' from episode_case union all
  select inbound, 'mangaluru-central-v1', 'inbound' from episode_case union all
  select fresh, 'mangaluru-central-v1', 'outbound' from episode_case;
insert into public.demo_traffic_segments(corridor_id, id, name, direction, geometry, length_m, baseline_seconds, baseline_label)
  select 'mangaluru-central-v1', c.id, 'Synthetic boundary segment', c.direction,
    '{"type":"LineString","coordinates":[[74.85,12.87],[74.86,12.88]]}', 100, 20, 'Synthetic baseline'
  from public.report_segment_catalog c join episode_case t on c.id in (t.segment, t.inbound, t.fresh);
insert into auth.users(id, is_anonymous) select user_id, false from episode_case;
insert into public.report_sources(id, user_id, kind) select source_id, user_id, 'account' from episode_case;

create function pg_temp.episode_report(p_segment text, p_direction text, p_observed timestamptz, p_category text default 'unknown')
returns uuid language plpgsql as $$
declare
  projection_id uuid := gen_random_uuid();
  assigned uuid;
begin
  assigned := public.assign_incident_episode(p_segment, p_direction, p_observed, statement_timestamp());
  if assigned is null then raise exception 'Unexpected metadata capacity rejection'; end if;
  insert into public.traffic_reports_private(public_id, source_id, request_id, canonical_input)
    select projection_id, source_id, gen_random_uuid(), '{}' from episode_case;
  insert into public.public_traffic_reports(id, episode_id, segment_id, direction, category, observed_at, received_at)
    values (projection_id, assigned, p_segment, p_direction, p_category, p_observed, statement_timestamp());
  return assigned;
end;
$$;

create temp table episode_expected (label text, id uuid);
do $$
declare
  c episode_case%rowtype;
  first_id uuid;
  next_id uuid;
  third_id uuid;
  envelope jsonb;
  summary jsonb;
  old_count integer;
  old_private_count integer;
  failed_public_id uuid := gen_random_uuid();
begin
  select * into c from episode_case;
  first_id := pg_temp.episode_report(c.segment, 'outbound', '2026-10-01T00:00:00Z');
  perform pg_temp.episode_assert(pg_temp.episode_report(c.segment, 'outbound', '2026-10-01T00:19:59.999999Z', 'accident') = first_id,
    'Gap minus one microsecond and category changes stay in latest');
  next_id := pg_temp.episode_report(c.segment, 'outbound', '2026-10-01T00:39:59.999999Z');
  perform pg_temp.episode_assert(next_id <> first_id, 'Exact twenty-minute gap creates successor');
  third_id := pg_temp.episode_report(c.segment, 'outbound', '2026-10-01T01:00:00Z');
  perform pg_temp.episode_assert(third_id <> next_id, 'Gap plus one microsecond creates successor');
  perform pg_temp.episode_assert(pg_temp.episode_report(c.segment, 'outbound', '2026-10-01T00:39:59.999998Z') = first_id,
    'Frozen interval accepts late observation beyond old high-water without bridging');
  perform pg_temp.episode_assert(pg_temp.episode_report(c.segment, 'outbound', '2026-10-01T00:39:59.999999Z') = next_id,
    'Frozen bounds are half-open');
  perform pg_temp.episode_assert(pg_temp.episode_report(c.segment, 'outbound', '2026-09-01T00:00:00Z') = first_id,
    'First lower bound remains unbounded');
  perform pg_temp.episode_assert(pg_temp.episode_report(c.segment, 'outbound', '2026-10-01T00:59:59.999998Z') = next_id,
    'Late bridge cannot merge historical episodes');
  perform pg_temp.episode_assert(pg_temp.episode_report(c.segment, 'outbound', '2026-10-01T00:59:59.999999Z') = third_id,
    'Latest lower bound includes its exact boundary');
  perform pg_temp.episode_assert((select observed_high_water = '2026-10-01T01:00:00Z' from public.incident_episodes where id = third_id),
    'Older latest members cannot reduce the high-water mark');
  perform pg_temp.episode_assert(pg_temp.episode_report(c.segment, 'outbound', '2026-10-01T01:19:59.999999Z') = third_id,
    'Latest advances within its twenty-minute gap');
  perform pg_temp.episode_assert((select observed_high_water = '2026-10-01T01:19:59.999999Z' from public.incident_episodes where id = third_id),
    'Latest high-water follows the greatest observation');
  perform pg_temp.episode_assert(pg_temp.episode_report(c.inbound, 'inbound', '2026-10-01T00:00:00Z') not in (first_id, next_id, third_id),
    'Directed segments have independent episodes');
  perform pg_temp.episode_assert((select observed_high_water = '2026-10-01T00:19:59.999999Z'
    and assignment_lower is null and assignment_upper = '2026-10-01T00:39:59.999999Z'
    from public.incident_episodes where id = first_id), 'Historical bounds and high-water are frozen');
  perform pg_temp.episode_assert((select count(*) = 1 from public.incident_episodes
    where segment_id = c.segment and assignment_upper is null), 'Exactly one latest episode');
  insert into episode_expected values ('first', first_id), ('next', next_id), ('latest', third_id);
  envelope := public.read_traffic_demo();
  select value into summary from jsonb_array_elements(envelope -> 'incident_episodes') where value ->> 'id' = first_id::text;
  perform pg_temp.episode_assert(summary = jsonb_build_object('id', first_id, 'segment_id', c.segment, 'direction', 'outbound',
    'created_at', (select created_at from public.incident_episodes where id = first_id),
    'first_observed_at', '2026-09-01T00:00:00Z'::timestamptz, 'last_observed_at', '2026-10-01T00:39:59.999998Z'::timestamptz,
    'report_count', 4, 'provenance', 'simulated'), 'Summary uses exact fields and retained observations, not frozen high-water');
  begin
    update public.public_traffic_reports set episode_id = next_id where episode_id = first_id;
    raise exception 'Membership update unexpectedly succeeded';
  exception when check_violation then null;
  end;
  begin
    insert into public.incident_episodes(segment_id, direction, observed_high_water)
      values (c.segment, 'outbound', statement_timestamp());
    raise exception 'Duplicate latest unexpectedly succeeded';
  exception when unique_violation then null;
  end;
  begin
    update public.public_traffic_reports set direction = 'inbound' where episode_id = first_id;
    raise exception 'Directed membership update unexpectedly succeeded';
  exception when check_violation or foreign_key_violation then null;
  end;
  select count(*) into old_count from public.incident_episodes;
  select count(*) into old_private_count from public.traffic_reports_private;
  begin
    perform public.assign_incident_episode(c.fresh, 'outbound', statement_timestamp(), statement_timestamp());
    insert into public.traffic_reports_private(public_id, source_id, request_id, canonical_input)
      values (failed_public_id, c.source_id, gen_random_uuid(), '{}');
    insert into public.public_traffic_reports(id, episode_id, segment_id, direction, category, observed_at, received_at)
      values (failed_public_id, first_id, c.fresh, 'outbound', 'unknown', statement_timestamp(), statement_timestamp());
    raise exception 'Cross-segment episode membership unexpectedly succeeded';
  exception when foreign_key_violation then null;
  end;
  perform pg_temp.episode_assert((select count(*) = old_count from public.incident_episodes), 'Failed projection rolls allocation back without orphan');
  perform pg_temp.episode_assert((select count(*) = old_private_count from public.traffic_reports_private), 'Failed directed FK rolls private insertion back without orphan');
end;
$$;

-- Public metadata is column-restricted, nonempty, and forced through RLS.
do $$
declare role_name text; column_name text;
begin
  perform pg_temp.episode_assert((select relrowsecurity and relforcerowsecurity from pg_class
    where oid = 'public.incident_episodes'::regclass), 'Episode RLS must be enabled and forced');
  foreach role_name in array array['anon', 'authenticated'] loop
    foreach column_name in array array['id', 'segment_id', 'direction', 'created_at', 'provenance'] loop
      perform pg_temp.episode_assert(has_column_privilege(role_name, 'public.incident_episodes', column_name, 'SELECT'), 'Public metadata column is readable');
    end loop;
    foreach column_name in array array['assignment_lower', 'assignment_upper', 'observed_high_water'] loop
      perform pg_temp.episode_assert(not has_column_privilege(role_name, 'public.incident_episodes', column_name, 'SELECT'), 'Internal episode columns must be denied');
    end loop;
    perform pg_temp.episode_assert(not has_table_privilege(role_name, 'public.incident_episodes', 'INSERT,UPDATE,DELETE,TRUNCATE'), 'Public episode writes denied');
  end loop;
  foreach role_name in array array['anon', 'authenticated', 'service_role', 'traffic_evidence_reader'] loop
    perform pg_temp.episode_assert(not has_function_privilege(role_name,
      'public.assign_incident_episode(text,text,timestamptz,timestamptz)', 'EXECUTE'), 'Internal allocator must not be exposed');
    perform pg_temp.episode_assert(not has_function_privilege(role_name, 'public.preserve_report_episode()', 'EXECUTE'),
      'Internal membership trigger must not be exposed');
  end loop;
  perform pg_temp.episode_assert(not has_any_column_privilege('traffic_evidence_reader', 'public.incident_episodes', 'SELECT,INSERT,UPDATE,REFERENCES'), 'L3 reader gains no episode access');
  perform pg_temp.episode_assert(not has_column_privilege('traffic_evidence_reader', 'public.public_traffic_reports', 'episode_id', 'SELECT'), 'L3 reader gains no membership access');
  perform pg_temp.episode_assert(not has_table_privilege('traffic_report_executor', 'public.incident_episodes', 'DELETE,TRUNCATE'), 'Executor cannot erase boundaries');
  perform pg_temp.episode_assert(not has_table_privilege('service_role', 'public.incident_episodes', 'INSERT,UPDATE,TRUNCATE'),
    'Service maintenance cannot fabricate or rewrite episode metadata');
end;
$$;

savepoint episode_cleanup;
select public.cleanup_traffic_reports(array[source_id]) from episode_case;
select pg_temp.episode_assert((select count(*) = 3 from public.incident_episodes e join episode_case c on e.segment_id = c.segment), 'Targeted cleanup retains frozen metadata');
set local role anon;
select pg_temp.episode_assert(not exists (select 1 from public.incident_episodes where segment_id like 'episode-boundary-%'), 'Empty episodes are hidden by public RLS');
reset role;
rollback to episode_cleanup;
delete from auth.users where id in (select user_id from episode_case);
select pg_temp.episode_assert((select count(*) = 3 from public.incident_episodes e join episode_case c on e.segment_id = c.segment), 'Auth deletion retains metadata');
set local role anon;
select pg_temp.episode_assert(not exists (select 1 from public.incident_episodes where segment_id like 'episode-boundary-%'), 'Auth cascade hides empty episodes');
reset role;
rollback to episode_cleanup;
select public.set_reporting_enabled(true);
select pg_temp.episode_assert(public.cleanup_traffic_reports(null) ->> 'status' = 'disabled_required', 'Full cleanup requires disabled reporting');
select public.set_reporting_enabled(false);
select pg_temp.episode_assert(public.cleanup_traffic_reports(null) ->> 'status' = 'ready', 'Disabled full cleanup succeeds');
select pg_temp.episode_assert(not exists (select 1 from public.incident_episodes), 'Full cleanup removes all episode metadata');
rollback to episode_cleanup;

-- Fill only transaction-local metadata. A cap rejection must not freeze the latest interval.
delete from public.traffic_reports_private where source_id in (select source_id from episode_case);
do $$
declare
  c episode_case%rowtype;
  remaining integer;
  anchor timestamptz := '2000-01-01Z';
  latest_id uuid;
  result jsonb;
  payload jsonb;
  private_count integer;
  replay_payload jsonb;
  acknowledgement jsonb;
begin
  select * into c from episode_case;
  perform public.set_reporting_enabled(true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', c.user_id, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  payload := jsonb_build_object('source_id', c.source_id, 'request_id', gen_random_uuid(), 'segment_id', c.fresh,
    'direction', 'outbound', 'category', 'unknown', 'observed_at', to_char(clock_timestamp() - interval '1 second', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  result := public.submit_traffic_report(payload);
  perform pg_temp.episode_assert(result ->> 'status' = 'accepted', 'Cap fixture needs normal report admission capacity');
  replay_payload := payload;
  latest_id := (result -> 'report' ->> 'episode_id')::uuid;
  select 2000 - count(*) into remaining from public.incident_episodes;
  insert into public.incident_episodes(segment_id, direction, assignment_lower, assignment_upper, observed_high_water, created_at)
    select c.fresh, 'outbound', anchor + i * interval '20 minutes', anchor + (i + 1) * interval '20 minutes',
      anchor + i * interval '20 minutes', anchor from generate_series(1, remaining) i;
  select count(*) into private_count from public.traffic_reports_private;
  result := public.submit_traffic_report(replay_payload);
  perform pg_temp.episode_assert(result ->> 'status' = 'accepted' and (result ->> 'replayed')::boolean
    and (result -> 'report' ->> 'episode_id')::uuid = latest_id, 'Replay at metadata cap never allocates');
  acknowledgement := public.get_report_acknowledgement(c.source_id, (replay_payload ->> 'request_id')::uuid);
  perform pg_temp.episode_assert(acknowledgement = result, 'Acknowledgement preserves episode membership at the cap');
  perform pg_temp.episode_assert(public.submit_traffic_report(jsonb_set(replay_payload, '{category}', '"flood"'))
    = '{"status":"conflict"}', 'Same-key conflict takes precedence over the metadata cap');
  payload := jsonb_set(payload, '{request_id}', to_jsonb(gen_random_uuid()));
  result := public.submit_traffic_report(payload);
  perform pg_temp.episode_assert(result ->> 'status' = 'accepted'
    and (result -> 'report' ->> 'episode_id')::uuid = latest_id, 'Existing latest accepts a new report at metadata cap');
  payload := jsonb_set(jsonb_set(payload, '{request_id}', to_jsonb(gen_random_uuid())), '{segment_id}', to_jsonb(c.segment));
  result := public.submit_traffic_report(payload);
  perform pg_temp.episode_assert(result = '{"status":"rate_limited"}', 'New episode at metadata cap returns rate_limited');
  perform pg_temp.episode_assert((select count(*) = private_count + 1 from public.traffic_reports_private), 'Metadata rejection leaves no private orphan');
  perform pg_temp.episode_assert((select count(*) = 2000 from public.incident_episodes), 'Metadata rejection allocates nothing');
  perform pg_temp.episode_assert((select assignment_upper is null from public.incident_episodes
    where id = (select id from episode_expected where label = 'latest')), 'Metadata rejection does not freeze latest');
  perform pg_temp.episode_assert(public.assign_incident_episode(c.segment, 'outbound', '2026-09-01Z', statement_timestamp())
    = (select id from episode_expected where label = 'first'), 'Historical membership remains assignable at metadata cap');
end;
$$;
\endif
rollback;
