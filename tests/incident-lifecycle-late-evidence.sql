-- Serial integration regression after migration 007; every fixture and ledger mutation rolls back.
begin;
set local statement_timeout = '120s';
set local timezone = 'UTC';
select pg_advisory_xact_lock(72861, 3);
create function pg_temp.late_assert(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%', message; end if; end;
$$;
create temp table late_case as select gen_random_uuid() run_id;
create function pg_temp.late_history() returns jsonb language sql as $$
  select jsonb_build_object(
    'cycles', (select coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]') from public.incident_lifecycle_cycles c join late_case t using(run_id)),
    'events', (select coalesce(jsonb_agg(to_jsonb(e) order by e.event_id),'[]') from public.incident_lifecycle_events e join late_case t using(run_id)),
    'samples', (select coalesce(jsonb_agg(to_jsonb(s) order by s.event_id,s.source_id,s.observed_at),'[]') from public.incident_lifecycle_event_samples s join late_case t using(run_id)),
    'links', (select coalesce(jsonb_agg(to_jsonb(l) order by l.event_id,l.episode_id),'[]') from public.incident_lifecycle_episode_links l join public.incident_lifecycle_events e using(event_id) join late_case t using(run_id)),
    'cursors', (select coalesce(jsonb_agg(to_jsonb(c) order by c.segment_id,c.direction),'[]') from public.incident_lifecycle_cursors c join late_case t using(run_id))
  );
$$;
create function pg_temp.late_projection(read_at timestamptz) returns jsonb language sql as $$
  select row from jsonb_array_elements(public.project_incident_lifecycle(read_at)) row
    where exists(select 1 from public.incident_lifecycle_cycles c join late_case t using(run_id) where c.id=(row->>'id')::uuid);
$$;
create function pg_temp.late_fixture(first_tick integer,last_tick integer,speed numeric,first_source integer default 1,last_source integer default 3)
returns void language plpgsql as $$
declare anchor timestamptz := '2026-10-16T10:00:00.123456Z'::timestamptz + last_tick * interval '1 minute';
begin
  delete from public.demo_traffic_corridors where id='mangaluru-central-v1';
  insert into public.demo_traffic_corridors values('mangaluru-central-v1','Late evidence','simulated','Synthetic','normal',anchor);
  insert into public.demo_traffic_segments values('mangaluru-central-v1','primary-west','Synthetic','outbound',
    '{"type":"LineString","coordinates":[[74.85,12.87],[74.86,12.88]]}',1500,180,'Synthetic baseline');
  insert into public.demo_traffic_sources select 'mangaluru-central-v1','late-source-'||n,'primary-west','Synthetic' from generate_series(1,6)n;
  insert into public.demo_traffic_observations select 'mangaluru-central-v1','primary-west','late-source-'||n,anchor,
    '2026-10-16T10:00:00.123456Z'::timestamptz + tick * interval '1 minute',speed,'simulated'
    from generate_series(first_source,last_source)n cross join generate_series(first_tick,last_tick)tick;
end;
$$;
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.capture_speed_evidence(uuid,uuid)'::regprocedure);
  perform pg_temp.late_assert(position('accepted := clock_timestamp();' in definition)>0,'Replace only the real capture clock');
  definition := replace(definition,'public.capture_speed_evidence(','pg_temp.capture_speed_evidence(');
  definition := replace(definition,'accepted := clock_timestamp();','accepted := current_setting(''late_test.clock'')::timestamptz;');
  execute definition;
end;
$$;
select pg_temp.late_assert(has_function_privilege('incident_lifecycle_reader','public.evaluate_incident_lifecycle(uuid,text,text,timestamptz)','EXECUTE'),'Internal reader may evaluate retained synthetic proof');
select pg_temp.late_assert(not has_function_privilege(role_name,'public.evaluate_incident_lifecycle(uuid,text,text,timestamptz)','EXECUTE'),'No public caller-clock evaluator grant') from unnest(array['anon','authenticated','service_role'])role_name;

select pg_temp.late_fixture(-5,0,8);
select set_config('late_test.clock','2026-10-16T10:00:00.123457Z',true);
select pg_temp.late_assert(pg_temp.capture_speed_evidence(run_id,gen_random_uuid())->>'status'='accepted','Initial slowdown capture') from late_case;
create temp table late_initial as select pg_temp.late_history() history;
select pg_temp.late_assert(pg_temp.late_projection('2026-10-16T10:00:00.123457Z')->>'state'='supported','Exactly three sources initially support');

-- Equal-terminal off-grid evidence invalidates one original source without a lifecycle transition.
insert into public.demo_traffic_observations values('mangaluru-central-v1','primary-west','late-source-1','2026-10-16T10:00:00.123456Z','2026-10-16T09:59:30.123456Z',8,'simulated');
select set_config('late_test.clock','2026-10-16T10:00:00.123458Z',true);
select pg_temp.late_assert(pg_temp.capture_speed_evidence(run_id,gen_random_uuid())->>'status'='accepted','Off-grid addition retained') from late_case;
select pg_temp.late_assert(pg_temp.late_history()=history,'Equal terminal leaves all historical evidence and cursor unchanged') from late_initial;
select pg_temp.late_assert(pg_temp.late_projection('2026-10-16T10:00:00.123459Z')->>'state'='unconfirmed','Off-grid loss withdraws current support immediately');
select pg_temp.late_assert(pg_temp.late_projection('2026-10-16T10:00:00.123459Z')->'cleared_at'='null','No false clearance');
select pg_temp.late_assert(pg_temp.late_projection('2026-10-16T10:00:00.123457Z')->>'state'='supported','As-of read excludes later accepted contradiction');
select pg_temp.late_assert(pg_temp.late_projection('2026-10-16T10:15:00.123Z')->>'state'='stale','Conservative original evidence deadline still expires');
select pg_temp.late_assert(pg_temp.late_history()=history,'Projection calls never write lifecycle state') from late_initial;

-- A favorable later equal-terminal cohort cannot erase the earlier withdrawal at read time.
select pg_temp.late_fixture(-5,0,8,4,4);
select set_config('late_test.clock','2026-10-16T10:00:00.123460Z',true);
select pg_temp.late_assert(pg_temp.capture_speed_evidence(run_id,gen_random_uuid())->>'status'='accepted','Replacement cohort retained at equal terminal') from late_case;
select pg_temp.late_assert(public.evaluate_incident_lifecycle(run_id,'primary-west','outbound','2026-10-16T10:00:00.123461Z')->'slowdown'->>'status'='supported','All current samples alone would support replacement cohort') from late_case;
select pg_temp.late_assert(pg_temp.late_projection('2026-10-16T10:00:00.123461Z')->>'state'='unconfirmed','Earlier same-terminal invalidation cannot be promoted by a read');
select pg_temp.late_assert(pg_temp.late_history()=history,'Replacement cohort does not rewrite historical references') from late_initial;

-- A strictly new terminal produces an ordinary support transition and restores the claim.
select pg_temp.late_fixture(1,6,8);
select set_config('late_test.clock','2026-10-16T10:06:00.123457Z',true);
select pg_temp.late_assert(pg_temp.capture_speed_evidence(run_id,gen_random_uuid())->>'status'='accepted','Advancing clean slowdown accepted') from late_case;
select pg_temp.late_assert(pg_temp.late_projection('2026-10-16T10:06:00.123458Z')->>'state'='supported','New terminal restores supported state');
select pg_temp.late_assert((select count(*)=2 from public.incident_lifecycle_events e join late_case t using(run_id)),'Only the advancing terminal adds a support event');
select pg_temp.late_assert((pg_temp.late_history()->'events') @> (history->'events') and (pg_temp.late_history()->'samples') @> (history->'samples'),'Original event and all sample references remain intact') from late_initial;

-- Persisted withdrawal must not be promoted even when late samples complete its terminal window.
select pg_temp.late_fixture(7,7,8,1,1);
select set_config('late_test.clock','2026-10-16T10:07:00.123457Z',true);
select pg_temp.late_assert(pg_temp.capture_speed_evidence(run_id,gen_random_uuid())->>'status'='accepted','Incomplete advancing terminal accepted') from late_case;
create temp table late_withdrawn as select pg_temp.late_history() history;
select pg_temp.late_fixture(7,7,8,2,3);
select set_config('late_test.clock','2026-10-16T10:07:00.123458Z',true);
select pg_temp.late_assert(pg_temp.capture_speed_evidence(run_id,gen_random_uuid())->>'status'='accepted','Late completion retained') from late_case;
select pg_temp.late_assert(public.evaluate_incident_lifecycle(run_id,'primary-west','outbound','2026-10-16T10:07:00.123459Z')->'slowdown'->>'status'='supported','Late completion qualifies sampled window') from late_case;
select pg_temp.late_assert(pg_temp.late_projection('2026-10-16T10:07:00.123459Z')->>'state'='unconfirmed','Persisted withdrawal cannot be promoted on equal terminal');
select pg_temp.late_assert(pg_temp.late_history()=history,'Late completion leaves withdrawn history and cursor unchanged') from late_withdrawn;
select pg_temp.late_fixture(8,8,8);
select set_config('late_test.clock','2026-10-16T10:08:00.123457Z',true);
select pg_temp.late_assert(pg_temp.capture_speed_evidence(run_id,gen_random_uuid())->>'status'='accepted','Next terminal accepted') from late_case;
select pg_temp.late_assert(pg_temp.late_projection('2026-10-16T10:08:00.123458Z')->>'state'='supported','Advancing terminal restores persisted withdrawal normally');

-- Historical clearance is immutable, including its recovery references.
update late_case set run_id=gen_random_uuid();
select pg_temp.late_fixture(-11,0,28);
update public.demo_traffic_observations set speed_kph=8 where observed_at < '2026-10-16T09:55:00.123456Z';
select set_config('late_test.clock','2026-10-16T10:00:00.123457Z',true);
select pg_temp.late_assert(pg_temp.capture_speed_evidence(run_id,gen_random_uuid())->>'status'='accepted','Complete historical recovery accepted') from late_case;
create temp table late_cleared as select pg_temp.late_history() history;
insert into public.demo_traffic_observations values('mangaluru-central-v1','primary-west','late-source-1','2026-10-16T10:00:00.123456Z','2026-10-16T09:59:30.123456Z',8,'simulated');
select set_config('late_test.clock','2026-10-16T10:00:00.123458Z',true);
select pg_temp.late_assert(pg_temp.capture_speed_evidence(run_id,gen_random_uuid())->>'status'='accepted','Late contradictory recovery sample retained') from late_case;
select pg_temp.late_assert(pg_temp.late_projection('2026-10-16T10:00:00.123459Z')->>'state'='cleared','Equal-terminal additions cannot rewrite historical clearance');
select pg_temp.late_assert(pg_temp.late_history()=history,'Cleared events, evidence references and cursor remain unchanged') from late_cleared;
rollback;
