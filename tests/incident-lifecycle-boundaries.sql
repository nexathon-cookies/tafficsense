-- Run serially after migration 003; all fixtures, clocks, grants and retention probes roll back.
begin;
set local statement_timeout = '120s';
set local timezone = 'UTC';
select pg_advisory_xact_lock(72861, 3);
create function pg_temp.lifecycle_assert(ok boolean, message text)
returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception '%', message; end if;
end;
$$;
select pg_temp.lifecycle_assert(to_regclass('public.incident_lifecycle_cycles') is not null, 'Apply lifecycle migration before boundary checks');
create temp table lifecycle_case as select gen_random_uuid() as run_id, gen_random_uuid() as batch_id;
create function pg_temp.lifecycle_projection(read_at timestamptz)
returns jsonb language sql as $$
  select coalesce(jsonb_agg(row order by row->>'started_at', row->>'id'), '[]'::jsonb)
  from jsonb_array_elements(public.project_incident_lifecycle(read_at)) row
  where exists(select 1 from public.incident_lifecycle_cycles c join lifecycle_case t using(run_id) where c.id = (row->>'id')::uuid);
$$;
create function pg_temp.lifecycle_fixture(first_tick integer, last_tick integer, speed numeric, source_count integer default 3)
returns void language plpgsql as $$
declare anchor timestamptz := '2026-10-16T10:00:00.123456Z'::timestamptz + last_tick * interval '1 minute';
begin
  delete from public.demo_traffic_corridors where id = 'mangaluru-central-v1';
  insert into public.demo_traffic_corridors values ('mangaluru-central-v1', 'Lifecycle boundary', 'simulated', 'Synthetic', 'normal', anchor);
  insert into public.demo_traffic_segments values ('mangaluru-central-v1', 'primary-west', 'Synthetic', 'outbound',
    '{"type":"LineString","coordinates":[[74.85,12.87],[74.86,12.88]]}', 1500, 180, 'Synthetic baseline');
  insert into public.demo_traffic_sources select 'mangaluru-central-v1', 'lifecycle-source-' || n, 'primary-west', 'Synthetic' from generate_series(1, 6) n;
  insert into public.demo_traffic_observations select 'mangaluru-central-v1', 'primary-west', 'lifecycle-source-' || n, anchor,
    '2026-10-16T10:00:00.123456Z'::timestamptz + tick * interval '1 minute', speed, 'simulated'
    from generate_series(1, source_count) n cross join generate_series(first_tick, last_tick) tick;
  perform set_config('lifecycle_test.clock', (anchor + interval '1 microsecond')::text, true);
end;
$$;
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.capture_speed_evidence(uuid,uuid)'::regprocedure);
  perform pg_temp.lifecycle_assert(position('accepted := clock_timestamp();' in definition) > 0, 'Clock-copy anchor remains exact');
  definition := replace(definition, 'public.capture_speed_evidence(', 'pg_temp.capture_speed_evidence(');
  definition := replace(definition, 'accepted := clock_timestamp();', 'accepted := current_setting(''lifecycle_test.clock'')::timestamptz;');
  execute definition;
end;
$$;

-- Slowdown alone creates a cycle; captured evidence and public IDs never depend on reports.
select pg_temp.lifecycle_fixture(-5, 0, 8);
select pg_temp.lifecycle_assert(pg_temp.capture_speed_evidence(run_id, batch_id)->>'status' = 'accepted', 'Initial slowdown accepted') from lifecycle_case;
select pg_temp.lifecycle_assert((select count(*) = 1 from public.incident_lifecycle_cycles c where c.run_id = t.run_id), 'Slowdown-only cycle persists') from lifecycle_case t;
select pg_temp.lifecycle_assert((select count(*) = 1 from public.incident_lifecycle_events e where e.run_id = t.run_id and e.kind = 'supported'), 'Initial support event persists') from lifecycle_case t;
create temp table lifecycle_original as select e.* from public.incident_lifecycle_events e join lifecycle_case t using(run_id);
select pg_temp.lifecycle_assert((pg_temp.capture_speed_evidence(run_id, batch_id)->>'replayed')::boolean, 'Replay accepted') from lifecycle_case;
select pg_temp.lifecycle_assert((select count(*) = 1 from public.incident_lifecycle_events e where e.run_id = t.run_id), 'Replay has no event') from lifecycle_case t;
select pg_temp.lifecycle_assert(pg_temp.lifecycle_projection('2026-10-16T10:14:59Z')->0->>'state' = 'supported', 'Fresh support projected');
select pg_temp.lifecycle_assert(pg_temp.lifecycle_projection('2026-10-16T10:15:00.123Z')->0->>'state' = 'stale', 'Conservative millisecond deadline expires without mutation');

-- Later terminal loss withdraws support, without clearance or history deletion.
select pg_temp.lifecycle_fixture(1, 1, 28, 1);
select pg_temp.lifecycle_assert(pg_temp.capture_speed_evidence(run_id, gen_random_uuid())->>'status' = 'accepted', 'Partial later terminal accepted') from lifecycle_case;
select pg_temp.lifecycle_assert(pg_temp.lifecycle_projection('2026-10-16T10:01:01Z')->0->>'state' = 'unconfirmed', 'Loss of support withdraws current claim');
select pg_temp.lifecycle_assert(pg_temp.lifecycle_projection('2026-10-16T10:15:00.123Z')->0->>'state' = 'stale', 'Withdrawn support later becomes stale');
create temp table lifecycle_withdrawn as select count(*) as events from public.incident_lifecycle_events e join lifecycle_case c using(run_id);
-- Equal-terminal late evidence completes a different window but must not rewrite history.
select pg_temp.lifecycle_fixture(1, 1, 28, 3);
select pg_temp.lifecycle_assert(pg_temp.capture_speed_evidence(run_id, gen_random_uuid())->>'status' = 'accepted', 'Equal terminal late additions retained') from lifecycle_case;
select pg_temp.lifecycle_assert((select count(*) from public.incident_lifecycle_events e join lifecycle_case c using(run_id)) = (select events from lifecycle_withdrawn), 'Equal terminal cannot rewrite history');

-- The retained old slowdown plus new recovery samples clear the same cycle.
select pg_temp.lifecycle_fixture(2, 6, 28);
select pg_temp.lifecycle_assert(pg_temp.capture_speed_evidence(run_id, gen_random_uuid())->>'status' = 'accepted', 'Ordered recovery accepted') from lifecycle_case;
select pg_temp.lifecycle_assert((select count(*) = 1 from public.incident_lifecycle_cycles c where c.run_id = t.run_id), 'Recovery keeps cycle identity') from lifecycle_case t;
select pg_temp.lifecycle_assert((select count(*) = 1 from public.incident_lifecycle_events e where e.run_id = t.run_id and e.kind = 'cleared'), 'Recovery persists clearance') from lifecycle_case t;
select pg_temp.lifecycle_assert(pg_temp.lifecycle_projection('2026-10-16T10:06:01Z')->0->>'state' = 'cleared', 'Historical clearance is explicit');
select pg_temp.lifecycle_assert((select count(*) = 36 from public.incident_lifecycle_event_samples s join public.incident_lifecycle_events e using(event_id,run_id) where e.kind = 'cleared' and e.run_id = t.run_id), 'Clearance retains exact twelve-tick references') from lifecycle_case t;

-- Reopening requires a wholly newer slowdown window and a new opaque cycle ID.
select pg_temp.lifecycle_fixture(7, 12, 8);
select pg_temp.lifecycle_assert(pg_temp.capture_speed_evidence(run_id, gen_random_uuid())->>'status' = 'accepted', 'New slowdown accepted') from lifecycle_case;
select pg_temp.lifecycle_assert((select count(*) = 2 from public.incident_lifecycle_cycles c where c.run_id = t.run_id), 'Reopening allocates new cycle') from lifecycle_case t;
select pg_temp.lifecycle_assert((select count(*) = 1 from public.incident_lifecycle_cycles c where c.run_id = t.run_id and c.prior_cycle_id is not null), 'New cycle references prior cycle') from lifecycle_case t;
select pg_temp.lifecycle_assert(not exists (select 1 from lifecycle_original o left join public.incident_lifecycle_events e using(event_id) where to_jsonb(o) is distinct from to_jsonb(e)), 'Initial transition is unchanged');

-- A new run cannot clear or borrow support from the first run.
create temp table lifecycle_other as select gen_random_uuid() as run_id;
select pg_temp.lifecycle_fixture(7, 12, 28);
select set_config('lifecycle_test.clock', '2026-10-16T10:12:00.123458Z', true);
select pg_temp.lifecycle_assert(pg_temp.capture_speed_evidence(run_id, gen_random_uuid())->>'status' = 'accepted', 'Other run accepted') from lifecycle_other;
select pg_temp.lifecycle_assert(not exists(select 1 from public.incident_lifecycle_cycles c join lifecycle_other t using(run_id)), 'Normal-only run cannot inherit incident');
select pg_temp.lifecycle_assert((select count(*) = 1 from public.incident_lifecycle_events e join lifecycle_case t using(run_id) where e.kind = 'cleared'), 'Other run cannot clear first run');
select pg_temp.lifecycle_assert(not exists(select 1 from jsonb_array_elements(pg_temp.lifecycle_projection('2026-10-16T10:12:01Z')) r where r->>'state' = 'supported'), 'Selected newer run cannot borrow old current support');

-- Reset and full reporting cleanup preserve speed-backed cycles and transition references.
savepoint reset_cleanup;
delete from public.demo_traffic_corridors where id = 'mangaluru-central-v1';
select pg_temp.lifecycle_assert(pg_temp.lifecycle_projection('2026-10-16T10:12:01Z') = '[]', 'Reset hides absent directed rows');
update public.reporting_settings set enabled = false;
select public.cleanup_traffic_reports(null);
select pg_temp.lifecycle_assert((select count(*) = 2 from public.incident_lifecycle_cycles c join lifecycle_case t using(run_id)), 'Report cleanup preserves cycles');
rollback to reset_cleanup;

-- All twelve ticks can establish historical support and clearance in a single capture.
savepoint initial_recovery;
select pg_temp.lifecycle_fixture(-5, 6, 28);
update public.demo_traffic_observations set speed_kph = 8 where observed_at < '2026-10-16T10:01:00.123456Z';
create temp table lifecycle_recovery as select gen_random_uuid() as run_id;
select pg_temp.lifecycle_assert(pg_temp.capture_speed_evidence(run_id, gen_random_uuid())->>'status' = 'accepted', 'Initial complete recovery accepted') from lifecycle_recovery;
select pg_temp.lifecycle_assert((select array_agg(kind order by terminal_at) = array['supported','cleared'] from public.incident_lifecycle_events e where e.run_id = t.run_id), 'Initial recovery preserves both ordered transitions') from lifecycle_recovery t;
rollback to initial_recovery;

-- Associations use the entire proof and half-open, frozen assignment bounds.
savepoint episode_associations;
create temp table lifecycle_episode_cases as select gen_random_uuid() as contained, gen_random_uuid() as lower_miss, gen_random_uuid() as upper_equal;
insert into public.incident_episodes(id, segment_id, direction, assignment_lower, assignment_upper, observed_high_water)
  select contained, 'primary-west', 'outbound', '2026-10-16T10:07:00.123456Z'::timestamptz, '2026-10-16T10:27:00.123456Z'::timestamptz, '2026-10-16T10:07:00.123456Z'::timestamptz from lifecycle_episode_cases
  union all select lower_miss, 'primary-west', 'outbound', '2026-10-16T10:07:00.123457Z', '2026-10-16T10:27:00.123457Z', '2026-10-16T10:07:00.123457Z' from lifecycle_episode_cases
  union all select upper_equal, 'primary-west', 'outbound', '2026-10-16T09:40:00.123456Z', '2026-10-16T10:12:00.123456Z', '2026-10-16T09:52:00.123456Z' from lifecycle_episode_cases;
select pg_temp.lifecycle_assert(exists(select 1 from public.incident_lifecycle_episode_links l
  join public.incident_lifecycle_events e using(event_id) join public.incident_lifecycle_cycles c on c.id=e.cycle_id
  join lifecycle_case t on t.run_id=c.run_id where c.prior_cycle_id is not null and l.episode_id=x.contained), 'Later-created episode links fully contained existing proof') from lifecycle_episode_cases x;
select pg_temp.lifecycle_assert(not exists(select 1 from public.incident_lifecycle_episode_links l
  join public.incident_lifecycle_events e using(event_id) join public.incident_lifecycle_cycles c on c.id=e.cycle_id
  join lifecycle_case t on t.run_id=c.run_id where c.prior_cycle_id is not null and l.episode_id in (x.lower_miss,x.upper_equal)), 'One microsecond lower miss and exact excluded upper bound cannot link') from lifecycle_episode_cases x;
delete from public.incident_episodes where id in (select contained from lifecycle_episode_cases);
select pg_temp.lifecycle_assert(exists(select 1 from public.incident_lifecycle_episode_links l where l.episode_id=x.contained), 'Episode cleanup cannot erase retained temporal association') from lifecycle_episode_cases x;
rollback to episode_associations;

-- Lifecycle failures occur after ledger insertion, but reject the entire capture atomically.
savepoint lifecycle_failure;
select pg_temp.lifecycle_fixture(13, 18, 8);
create temp table lifecycle_failed as select gen_random_uuid() as run_id, gen_random_uuid() as batch_id;
create function pg_temp.lifecycle_fail_event() returns trigger language plpgsql as $$
begin raise exception 'Injected lifecycle failure' using errcode = 'PLI01'; end;
$$;
create trigger lifecycle_injected_failure after insert on public.incident_lifecycle_events for each row execute function pg_temp.lifecycle_fail_event();
do $$
declare t lifecycle_failed%rowtype;
begin
  select * into t from lifecycle_failed;
  begin
    perform pg_temp.capture_speed_evidence(t.run_id,t.batch_id);
    raise exception 'Injected event failure was not reached';
  exception when sqlstate 'PLI01' then null;
  end;
  perform pg_temp.lifecycle_assert(not exists(select 1 from public.speed_evidence_runs where run_id=t.run_id), 'Lifecycle failure rolls back ledger and derived allocation');
end;
$$;
drop trigger lifecycle_injected_failure on public.incident_lifecycle_events;
select pg_temp.lifecycle_assert(pg_temp.capture_speed_evidence(run_id,batch_id)->>'status'='accepted', 'Identical IDs succeed after failure removed') from lifecycle_failed;
rollback to lifecycle_failure;

savepoint lifecycle_cycle_cap;
insert into public.incident_lifecycle_cycles(run_id,segment_id,direction,started_at,created_at)
  select t.run_id,'primary-west','outbound','2026-10-16T09:00:00Z','2026-10-16T10:00:00Z' from lifecycle_case t
  cross join generate_series(1, 2000-(select count(*)::integer from public.incident_lifecycle_cycles));
select pg_temp.lifecycle_fixture(13,18,8);
do $$
declare rejected uuid := gen_random_uuid();
begin
  begin
    perform pg_temp.capture_speed_evidence(rejected,gen_random_uuid());
    raise exception 'Cycle budget did not reject allocation';
  exception when program_limit_exceeded then null;
  end;
  perform pg_temp.lifecycle_assert(not exists(select 1 from public.speed_evidence_runs where run_id=rejected), 'Cycle cap rolls back entire capture');
end;
$$;
rollback to lifecycle_cycle_cap;

savepoint lifecycle_event_cap;
insert into public.incident_lifecycle_events(cycle_id,run_id,batch_id,kind,terminal_at,accepted_at,proof_start,valid_until,
  complete_source_count,slow_source_count,recovered_source_count,continuous_source_count,conflicting_source_count)
  select e.cycle_id,e.run_id,e.batch_id,'withdrawn','2026-10-15T00:00:00Z'::timestamptz+n*interval '1 second',
    '2026-10-16T10:00:00Z','2026-10-15T00:00:00Z',null,0,0,0,0,0
  from lifecycle_original e cross join generate_series(1,10000-(select count(*)::integer from public.incident_lifecycle_events)) n;
select pg_temp.lifecycle_fixture(13,18,8);
do $$
declare rejected uuid := gen_random_uuid();
begin
  begin
    perform pg_temp.capture_speed_evidence(rejected,gen_random_uuid());
    raise exception 'Event budget did not reject allocation';
  exception when program_limit_exceeded then null;
  end;
  perform pg_temp.lifecycle_assert(not exists(select 1 from public.speed_evidence_runs where run_id=rejected), 'Event cap rolls back cycle and ledger insertion');
end;
$$;
rollback to lifecycle_event_cap;

-- Least privilege includes private reporter/Auth exclusion and immutable evidence history.
do $$
declare t text; r text; f text;
begin
  foreach r in array array['incident_lifecycle_executor','incident_lifecycle_reader'] loop
    perform pg_temp.lifecycle_assert((select not rolcanlogin and not rolbypassrls and not rolsuper and not rolinherit from pg_roles where rolname = r), 'Restricted lifecycle role');
    foreach t in array array['auth.users','public.profiles','public.traffic_reports_private','public.report_sources'] loop
      perform pg_temp.lifecycle_assert(not has_table_privilege(r,t,'SELECT,INSERT,UPDATE,DELETE'), 'No private identity grants');
    end loop;
  end loop;
  foreach t in array array['cycles','events','event_samples','episode_links','cursors'] loop
    t := 'public.incident_lifecycle_' || t;
    perform pg_temp.lifecycle_assert((select relrowsecurity and relforcerowsecurity from pg_class where oid=t::regclass), 'Forced RLS');
    foreach r in array array['anon','authenticated','service_role'] loop
      perform pg_temp.lifecycle_assert(not has_table_privilege(r,t,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER'), 'No direct lifecycle mutation');
    end loop;
    foreach r in array array['anon','authenticated'] loop
      perform pg_temp.lifecycle_assert(not has_table_privilege(r,t,'SELECT'), 'No raw lifecycle reads');
    end loop;
  end loop;
  foreach f in array array['public.project_incident_lifecycle(timestamptz)','public.evaluate_incident_lifecycle(uuid,text,text,timestamptz)','public.process_incident_lifecycle(uuid,uuid)'] loop
    foreach r in array array['anon','authenticated','service_role'] loop
      perform pg_temp.lifecycle_assert(not has_function_privilege(r,f,'EXECUTE'), 'No public clock/process override');
    end loop;
  end loop;
  begin
    update public.incident_lifecycle_events set kind = kind;
    raise exception 'Immutable event update succeeded';
  exception when check_violation then null;
  end;
end;
$$;

select public.cleanup_speed_evidence(run_id) from lifecycle_case;
select pg_temp.lifecycle_assert(not exists(select 1 from public.incident_lifecycle_cycles c join lifecycle_case t using(run_id)), 'Explicit run cleanup cascades synthetic lifecycle');
select pg_temp.lifecycle_assert(not exists(select 1 from public.incident_lifecycle_event_samples s join lifecycle_case t using(run_id)), 'Explicit run cleanup cascades evidence links');
rollback;
