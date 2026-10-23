-- Run only under serial database ownership; every mutation rolls back.
begin;
set local statement_timeout = '120s';
set local lock_timeout = '5s';
set local timezone = 'UTC';
select pg_advisory_xact_lock(72861, 3);
create function pg_temp.traversal_assert(ok boolean, message text)
returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception '%', message; end if;
end;
$$;
select pg_temp.traversal_assert(to_regclass('public.completed_traversals') is not null, 'Apply traversal migration before testing');

create temp table traversal_case as select gen_random_uuid() run_id, gen_random_uuid() batch_id, gen_random_uuid() traversal_id,
  '2026-10-16T10:00:00.123456Z'::timestamptz read_at;
insert into public.speed_evidence_runs select run_id, 'mangaluru-central-v1', read_at - interval '1 minute', 'simulated' from traversal_case;
insert into public.speed_evidence_segments select run_id, 'primary-west', 'outbound', 1500, 180, 'Frozen traversal baseline' from traversal_case;
insert into public.speed_evidence_sources select run_id, 'primary-west-source-1', 'primary-west', 'outbound', 'SIMULATED source' from traversal_case;
insert into public.speed_evidence_batches select run_id, batch_id, read_at - interval '1 minute', read_at - interval '1 minute', sha256('traversal test'), 12, 12 from traversal_case;
insert into public.speed_evidence_observations
  select run_id, 'primary-west-source-1', read_at - interval '20 minutes' + n * interval '1 minute', 'primary-west', 'outbound', 8, batch_id
  from traversal_case cross join generate_series(0, 11) n;
insert into public.speed_evidence_batch_samples
  select run_id, batch_id, 'primary-west-source-1', read_at - interval '20 minutes' + (n - 1) * interval '1 minute', n
  from traversal_case cross join generate_series(1, 12) n;

-- A transaction-local clock copy exposes no deployed caller-clock mutation API.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.ingest_completed_traversal(jsonb)'::regprocedure);
  perform pg_temp.traversal_assert(position('accepted := clock_timestamp();' in definition) > 0, 'Replace only the internal acceptance clock');
  definition := replace(definition, 'public.ingest_completed_traversal(', 'pg_temp.ingest_completed_traversal(');
  definition := replace(definition, 'accepted := clock_timestamp();', 'accepted := current_setting(''traversal_test.clock'')::timestamptz;');
  execute definition;
end;
$$;
select set_config('traversal_test.clock', read_at::text, true) from traversal_case;
create function pg_temp.traversal_input()
returns jsonb language sql as $$
  select jsonb_build_object('traversal_id', traversal_id, 'run_id', run_id, 'batch_id', batch_id,
    'source_id', 'primary-west-source-1', 'segment_id', 'primary-west', 'direction', 'outbound',
    'entered_at', read_at - interval '676 seconds', 'exited_at', read_at - interval '1 second',
    'distance_m', 1500, 'baseline_seconds', 180, 'baseline_label', 'Frozen traversal baseline') from traversal_case
$$;

-- Dedicated readers/writers cannot read private identity or mutate retained records directly.
do $$
declare role_name text; f text;
begin
  foreach role_name in array array['traversal_executor', 'traversal_reader'] loop
    perform pg_temp.traversal_assert((select not rolcanlogin and not rolbypassrls and not rolsuper and not rolinherit
      and not rolcreatedb and not rolcreaterole from pg_roles where rolname = role_name), 'Restricted traversal role');
    perform pg_temp.traversal_assert(not has_schema_privilege(role_name, 'public', 'CREATE'), 'No object creation');
    foreach f in array array['auth.users', 'public.profiles', 'public.report_sources', 'public.traffic_reports_private'] loop
      perform pg_temp.traversal_assert(not has_table_privilege(role_name, f, 'SELECT,INSERT,UPDATE,DELETE'), 'No private identity access');
    end loop;
  end loop;
  perform pg_temp.traversal_assert((select relrowsecurity and relforcerowsecurity
    and relowner not in ('traversal_executor'::regrole, 'traversal_reader'::regrole)
    from pg_class where oid = 'public.completed_traversals'::regclass), 'Non-owner roles and forced RLS');
  foreach role_name in array array['anon', 'authenticated', 'traffic_evidence_reader'] loop
    perform pg_temp.traversal_assert(not has_table_privilege(role_name, 'public.completed_traversals', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'), 'No public ledger access');
    foreach f in array array['public.ingest_completed_traversal(jsonb)', 'public.check_completed_traversal(uuid)',
      'public.read_traversal_context(uuid,uuid,text)', 'public.project_completed_traversal(uuid,text,text,timestamp with time zone)'] loop
      perform pg_temp.traversal_assert(not has_function_privilege(role_name, f, 'EXECUTE'), 'No public internal RPC execution');
    end loop;
  end loop;
  foreach role_name in array array['service_role', 'traversal_reader'] loop
    perform pg_temp.traversal_assert(not has_table_privilege(role_name, 'public.completed_traversals', 'INSERT,UPDATE,DELETE,TRUNCATE'), 'No direct service or reader mutation');
  end loop;
end;
$$;

select pg_temp.traversal_assert(pg_temp.ingest_completed_traversal(pg_temp.traversal_input()) ->> 'status' = 'accepted', '675-second completion admitted');
select pg_temp.traversal_assert((public.check_completed_traversal(traversal_id) ->> 'replayed')::boolean, 'Retained acknowledgement') from traversal_case;
select pg_temp.traversal_assert((pg_temp.ingest_completed_traversal(pg_temp.traversal_input()) ->> 'replayed')::boolean, 'Idempotent original completion');
select pg_temp.traversal_assert((select count(*) = 1 from public.completed_traversals where run_id = c.run_id), 'Exactly one retained completion') from traversal_case c;

do $$
declare mutation jsonb; c traversal_case%rowtype;
begin
  select * into c from traversal_case;
  foreach mutation in array array[
    '{"distance_m":1499}'::jsonb, '{"baseline_seconds":181}', '{"baseline_label":"Other"}', '{"source_id":"other"}',
    '{"direction":"inbound"}', jsonb_build_object('run_id', gen_random_uuid()), jsonb_build_object('batch_id', gen_random_uuid()),
    jsonb_build_object('exited_at', c.read_at)
  ] loop
    perform pg_temp.traversal_assert(pg_temp.ingest_completed_traversal(pg_temp.traversal_input() || mutation) = '{"status":"conflict"}', 'Conflicting stable ID rejects atomically');
  end loop;
  perform pg_temp.traversal_assert(pg_temp.ingest_completed_traversal(pg_temp.traversal_input() || jsonb_build_object('traversal_id', gen_random_uuid())) = '{"status":"conflict"}', 'Different ID cannot duplicate source/entry identity');
  begin
    update public.completed_traversals set entered_at = entered_at where run_id = c.run_id;
    raise exception 'Update unexpectedly accepted';
  exception when check_violation then null;
  end;
end;
$$;

savepoint fresh_edges;
delete from public.completed_traversals where run_id in (select run_id from traversal_case);
do $$
declare payload jsonb := pg_temp.traversal_input(); c traversal_case%rowtype; mutation jsonb;
begin
  select * into c from traversal_case;
  foreach mutation in array array[
    '{"distance_m":1499}'::jsonb, '{"distance_m":1500.1}', '{"baseline_seconds":181}', '{"baseline_label":"Other"}',
    '{"source_id":"other"}', '{"segment_id":"other"}', '{"direction":"inbound"}', '{"delay_seconds":495}',
    jsonb_build_object('entered_at', c.read_at - interval '20 minutes'),
    jsonb_build_object('entered_at', c.read_at), jsonb_build_object('exited_at', c.read_at + interval '1 microsecond'),
    '{"entered_at":"infinity"}', '{"entered_at":"2026-02-30T00:00:00Z"}',
    '{"entered_at":"2026-10-16T24:00:00Z"}', '{"entered_at":"2026-10-16T09:59:60Z"}',
    '{"entered_at":"2026-10-16T09:59:00.1234567Z"}', '{"entered_at":"2026-10-16T09:59:00+16:00"}'
  ] loop
    perform pg_temp.traversal_assert(pg_temp.ingest_completed_traversal(payload || mutation) ->> 'status' in ('invalid','conflict','unavailable'), 'Invalid/incompatible new completion rejects');
  end loop;
  perform pg_temp.traversal_assert(not exists(select 1 from public.completed_traversals where run_id = c.run_id), 'Every rejection allocates nothing');
  perform pg_temp.traversal_assert(pg_temp.ingest_completed_traversal(payload || jsonb_build_object('entered_at', c.read_at - interval '20 minutes' + interval '1 microsecond', 'exited_at', c.read_at - interval '525 seconds' + interval '1 microsecond')) ->> 'status' = 'accepted', 'One microsecond inside freshness with a proven 675-second exit admitted');
  delete from public.completed_traversals where run_id = c.run_id;
  perform pg_temp.traversal_assert(pg_temp.ingest_completed_traversal(payload || jsonb_build_object('entered_at', c.read_at - interval '675 seconds', 'exited_at', c.read_at)) ->> 'status' = 'accepted', 'Proven exit exactly at acceptance admitted');
end;
$$;
rollback to fresh_edges;

savepoint projection;
delete from public.demo_traffic_corridors where id = 'mangaluru-central-v1';
insert into public.demo_traffic_corridors select 'mangaluru-central-v1','SIMULATED','simulated','Synthetic','normal',read_at from traversal_case;
insert into public.demo_traffic_segments values ('mangaluru-central-v1','primary-west','SIMULATED','outbound',
  '{"type":"LineString","coordinates":[[74.85,12.87],[74.86,12.88]]}',1500,180,'Frozen traversal baseline');
do $$
declare c traversal_case%rowtype; summary jsonb;
begin
  select * into c from traversal_case;
  summary := public.project_completed_traversal(c.run_id, 'primary-west', 'outbound', c.read_at);
  perform pg_temp.traversal_assert(summary ->> 'state' = 'available' and (summary ->> 'delay_seconds')::numeric = 495
    and (summary ->> 'elapsed_seconds')::numeric = 675, 'Exact 675 minus 180 is 495');
  perform pg_temp.traversal_assert((select array_agg(key order by key) from jsonb_object_keys(summary) key) = array[
    'baseline_label','baseline_seconds','delay_seconds','direction','elapsed_seconds','entered_at','exited_at','provenance','segment_id','state','valid_until'], 'Exact privacy allowlist');
  perform pg_temp.traversal_assert(public.project_completed_traversal(gen_random_uuid(), 'primary-west', 'outbound', c.read_at) ->> 'state' = 'missing', 'Selected missing run cannot borrow older completion');
  perform pg_temp.traversal_assert(public.project_completed_traversal(c.run_id, 'primary-west', 'outbound', c.read_at + interval '524 seconds' - interval '1 microsecond') ->> 'state' = 'available', 'Fresh until exact entry expiry');
  summary := public.project_completed_traversal(c.run_id, 'primary-west', 'outbound', c.read_at + interval '524 seconds');
  perform pg_temp.traversal_assert(summary ->> 'state' = 'stale' and summary -> 'delay_seconds' = 'null', 'Exact expiry withdraws delay');
  summary := public.project_completed_traversal(c.run_id, 'primary-west', 'outbound', c.read_at - interval '1 microsecond');
  perform pg_temp.traversal_assert(summary ->> 'state' = 'future' and summary -> 'delay_seconds' = 'null', 'Future acceptance not promoted');
  update public.demo_traffic_segments set baseline_seconds = 181 where id = 'primary-west';
  summary := public.project_completed_traversal(c.run_id, 'primary-west', 'outbound', c.read_at);
  perform pg_temp.traversal_assert(summary ->> 'state' = 'incompatible' and summary -> 'delay_seconds' = 'null', 'Frozen baseline incompatibility never falls back');
end;
$$;
rollback to projection;

savepoint selected_record;
delete from public.demo_traffic_corridors where id = 'mangaluru-central-v1';
insert into public.demo_traffic_corridors select 'mangaluru-central-v1','SIMULATED','simulated','Synthetic','normal',read_at from traversal_case;
insert into public.demo_traffic_segments values ('mangaluru-central-v1','primary-west','SIMULATED','outbound',
  '{"type":"LineString","coordinates":[[74.85,12.87],[74.86,12.88]]}',1500,180,'Frozen traversal baseline');
delete from public.completed_traversals where run_id in (select run_id from traversal_case);
insert into public.completed_traversals(traversal_id,run_id,batch_id,source_id,segment_id,direction,entered_at,exited_at,distance_m,accepted_at)
  select gen_random_uuid(),run_id,batch_id,'primary-west-source-1','primary-west','outbound',
    read_at - interval '678 seconds', read_at - interval '3 seconds',1500,read_at - interval '3 seconds' from traversal_case;
insert into public.completed_traversals(traversal_id,run_id,batch_id,source_id,segment_id,direction,entered_at,exited_at,distance_m,accepted_at)
  select gen_random_uuid(),run_id,batch_id,'primary-west-source-1','primary-west','outbound',
    read_at - interval '1201 seconds', read_at - interval '2 seconds',1500,read_at - interval '2 seconds' from traversal_case;
select pg_temp.traversal_assert(public.project_completed_traversal(run_id,'primary-west','outbound',read_at) ->> 'state' = 'invalid', 'Latest unproven legacy exit cannot fall back to an older valid completion') from traversal_case;
insert into public.completed_traversals(traversal_id,run_id,batch_id,source_id,segment_id,direction,entered_at,exited_at,distance_m,accepted_at)
  select gen_random_uuid(),run_id,batch_id,'primary-west-source-1','primary-west','outbound',
    read_at - interval '674 seconds',read_at + interval '1 second',1500,read_at + interval '1 second' from traversal_case;
select pg_temp.traversal_assert(public.project_completed_traversal(run_id,'primary-west','outbound',read_at) ->> 'state' = 'future', 'Future selected completion never falls back') from traversal_case;
insert into public.completed_traversals(traversal_id,run_id,batch_id,source_id,segment_id,direction,entered_at,exited_at,distance_m,accepted_at)
  select gen_random_uuid(),run_id,batch_id,'primary-west-source-1','primary-west','outbound',
    read_at - interval '99 seconds',read_at + interval '2 seconds',1499,read_at + interval '2 seconds' from traversal_case;
select pg_temp.traversal_assert(public.project_completed_traversal(run_id,'primary-west','outbound',read_at) ->> 'state' = 'invalid', 'Invalid administrative evidence never falls back') from traversal_case;
do $$
declare c traversal_case%rowtype; duration numeric; summary jsonb;
begin
  select * into c from traversal_case;
  foreach duration in array array[90::numeric,180::numeric,180.000001::numeric] loop
    delete from public.completed_traversals where run_id = c.run_id;
    perform pg_temp.traversal_assert(pg_temp.ingest_completed_traversal(pg_temp.traversal_input() ||
      jsonb_build_object('entered_at',c.read_at - interval '1 second' - duration * interval '1 second')) = '{"status":"invalid"}', 'Normal/faster/microsecond duration cannot be invented for retained 8 km/h motion');
    summary := public.project_completed_traversal(c.run_id,'primary-west','outbound',c.read_at);
    perform pg_temp.traversal_assert(summary ->> 'state' = 'missing' and summary -> 'delay_seconds' = 'null', 'Forged zero or tiny delay allocates no completion');
  end loop;
end;
$$;
rollback to selected_record;

savepoint aged_retry;
select set_config('traversal_test.clock', (read_at + interval '1 day')::text, true) from traversal_case;
select pg_temp.traversal_assert((pg_temp.ingest_completed_traversal(pg_temp.traversal_input()) ->> 'replayed')::boolean, 'Aged identical replay succeeds before freshness/caps');
rollback to aged_retry;

savepoint insert_fault;
create function pg_temp.fail_traversal_insert() returns trigger language plpgsql as $$
begin
  raise exception 'Injected traversal final insert failure' using errcode = 'PTR01';
end;
$$;
create trigger traversal_insert_fault after insert on public.completed_traversals for each statement execute function pg_temp.fail_traversal_insert();
do $$
declare c traversal_case%rowtype; before_count bigint; new_id uuid := gen_random_uuid();
begin
  select * into c from traversal_case;
  select count(*) into before_count from public.completed_traversals;
  begin
    perform pg_temp.ingest_completed_traversal(pg_temp.traversal_input() || jsonb_build_object('traversal_id',new_id,'entered_at',c.read_at - interval '700 seconds','exited_at',c.read_at - interval '25 seconds'));
    raise exception 'Injected failure was not reached';
  exception when sqlstate 'PTR01' then null;
  end;
  perform pg_temp.traversal_assert((select count(*) = before_count from public.completed_traversals), 'Failed insert rolls back every allocated completion');
  perform pg_temp.traversal_assert(public.check_completed_traversal(new_id) = '{"status":"not_found"}', 'Failed completion has no acknowledgement');
  perform pg_temp.traversal_assert(public.check_completed_traversal(c.traversal_id) ->> 'status' = 'accepted', 'Failed completion preserves earlier acknowledgement');
end;
$$;
rollback to insert_fault;

savepoint traversal_cap;
insert into public.completed_traversals(traversal_id, run_id, batch_id, source_id, segment_id, direction, entered_at, exited_at, distance_m, accepted_at)
  select gen_random_uuid(), run_id, batch_id, 'primary-west-source-1', 'primary-west', 'outbound',
    read_at - interval '3 minutes' + n * interval '1 microsecond', read_at - interval '1 second', 1500, read_at
  from traversal_case cross join generate_series(1, 999) n;
select pg_temp.traversal_assert(pg_temp.ingest_completed_traversal(pg_temp.traversal_input() || jsonb_build_object('traversal_id',gen_random_uuid(),'entered_at',read_at - interval '680 seconds','exited_at',read_at - interval '5 seconds')) = '{"status":"limit_reached"}', 'Per-run cap rejects without eviction') from traversal_case;
select pg_temp.traversal_assert((pg_temp.ingest_completed_traversal(pg_temp.traversal_input()) ->> 'replayed')::boolean, 'Replay works at capacity');
rollback to traversal_cap;

savepoint global_traversal_cap;
create temp table traversal_cap_runs as select n slot,gen_random_uuid() run_id,gen_random_uuid() batch_id from generate_series(1,10) n;
insert into public.speed_evidence_runs select r.run_id,'mangaluru-central-v1',c.read_at,'simulated' from traversal_cap_runs r cross join traversal_case c;
insert into public.speed_evidence_segments select run_id,'primary-west','outbound',1500,180,'Frozen traversal baseline' from traversal_cap_runs;
insert into public.speed_evidence_sources select run_id,'primary-west-source-1','primary-west','outbound','SIMULATED' from traversal_cap_runs;
insert into public.speed_evidence_batches select r.run_id,r.batch_id,c.read_at,c.read_at,sha256('traversal cap'),1,0 from traversal_cap_runs r cross join traversal_case c;
insert into public.completed_traversals(traversal_id,run_id,batch_id,source_id,segment_id,direction,entered_at,exited_at,distance_m,accepted_at)
  select gen_random_uuid(),r.run_id,r.batch_id,'primary-west-source-1','primary-west','outbound',
    c.read_at - interval '3 minutes' + n * interval '1 microsecond',c.read_at - interval '1 second',1500,c.read_at
  from generate_series(1,9999 - (select count(*)::integer from public.completed_traversals)) n
  join traversal_cap_runs r on r.slot = 1 + (n - 1) / 1000 cross join traversal_case c;
select pg_temp.traversal_assert(pg_temp.ingest_completed_traversal(pg_temp.traversal_input() || jsonb_build_object('traversal_id',gen_random_uuid(),'entered_at',read_at - interval '680 seconds','exited_at',read_at - interval '5 seconds')) ->> 'status' = 'accepted', 'Ten-thousandth retained completion admitted') from traversal_case;
select pg_temp.traversal_assert((select count(*) = 10000 from public.completed_traversals), 'Global cap reached exactly');
select pg_temp.traversal_assert(pg_temp.ingest_completed_traversal(pg_temp.traversal_input() || jsonb_build_object('traversal_id',gen_random_uuid(),'entered_at',read_at - interval '681 seconds','exited_at',read_at - interval '6 seconds')) = '{"status":"limit_reached"}', 'Global cap plus one rejects without eviction') from traversal_case;
select pg_temp.traversal_assert((pg_temp.ingest_completed_traversal(pg_temp.traversal_input()) ->> 'replayed')::boolean, 'Original retry remains available at global capacity');
rollback to global_traversal_cap;

savepoint fixture_reset;
delete from public.demo_traffic_corridors where id = 'mangaluru-central-v1';
select pg_temp.traversal_assert(public.check_completed_traversal(traversal_id) ->> 'status' = 'accepted', 'Fixture reset preserves immutable completion') from traversal_case;
select pg_temp.traversal_assert(public.read_traversal_context(run_id,batch_id,'primary-west-source-1') ->> 'status' = 'ready', 'Context comes from retained membership after reset') from traversal_case;
rollback to fixture_reset;
select public.cleanup_speed_evidence(run_id) from traversal_case;
select pg_temp.traversal_assert(public.check_completed_traversal(traversal_id) = '{"status":"not_found"}', 'Explicit run cleanup cascades synthetic completions only') from traversal_case;
rollback;
