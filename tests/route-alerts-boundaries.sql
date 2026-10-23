-- All clock substitutions and synthetic evidence are transaction-local and rolled back.
begin;
set local statement_timeout = '120s';
set local lock_timeout = '5s';
set local timezone = 'UTC';
select pg_advisory_xact_lock(72861, 3);
create function pg_temp.route_assert(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Route comparison: %', label; end if; end;
$$;
select pg_temp.route_assert(to_regprocedure('public.read_traffic_phase5()') is not null, 'Apply Phase five snapshot migration before tests');
select pg_temp.route_assert((select provolatile = 's' and prosecdef and pronargs = 0 and prolang = (select oid from pg_language where lanname = 'sql')
  from pg_proc where oid = 'public.read_traffic_phase5()'::regprocedure), 'One stable SQL no-argument restricted snapshot');
select pg_temp.route_assert((select not rolcanlogin and not rolbypassrls and not rolsuper from pg_roles where rolname = 'phase5_snapshot_reader'), 'Non-login non-bypass reader');
select pg_temp.route_assert(not has_schema_privilege('phase5_snapshot_reader','public','CREATE'), 'No schema creation');
select pg_temp.route_assert(not pg_has_role('postgres','phase5_snapshot_reader','SET') and not pg_has_role('postgres','phase4_snapshot_reader','SET')
  and not pg_has_role('postgres','traversal_reader','SET') and not pg_has_role('postgres','incident_lifecycle_reader','SET'), 'Temporary ownership memberships removed');
select pg_temp.route_assert(not has_column_privilege('phase5_snapshot_reader','public.completed_traversals','source_id','SELECT'), 'No source identity access');
select pg_temp.route_assert(not has_table_privilege('phase5_snapshot_reader','public.traffic_reports_private','SELECT')
  and not has_table_privilege('phase5_snapshot_reader','public.speed_evidence_observations','SELECT')
  and not has_table_privilege('phase5_snapshot_reader','auth.users','SELECT'), 'No private reports, raw samples or accounts');
do $$
declare r text; t text;
begin
  foreach r in array array['anon','authenticated','service_role'] loop
    perform pg_temp.route_assert(has_function_privilege(r,'public.read_traffic_phase5()','EXECUTE'), 'Public wrapper granted');
    perform pg_temp.route_assert(not has_function_privilege(r,'public.project_completed_traversal(uuid,text,text,timestamptz)','EXECUTE'), 'No traversal caller clock');
    perform pg_temp.route_assert(not has_function_privilege(r,'public.project_incident_lifecycle(timestamptz)','EXECUTE'), 'No lifecycle caller clock');
  end loop;
  foreach t in array array['speed_evidence_batches','speed_evidence_segments','completed_traversals','incident_lifecycle_cycles','public_traffic_reports','demo_traffic_routes'] loop
    perform pg_temp.route_assert(not has_table_privilege('phase5_snapshot_reader','public.' || t,'INSERT,UPDATE,DELETE,TRUNCATE'), 'No writes to ' || t);
  end loop;
end;
$$;
set local role anon;
do $$
declare old jsonb; combined jsonb;
begin
  old := public.read_traffic_phase4(); combined := public.read_traffic_phase5();
  perform pg_temp.route_assert(combined->'phase4' = old and public.read_traffic_phase4() = old, 'Phase four unchanged within the exact same SQL snapshot');
  perform pg_temp.route_assert((select count(*) = 2 from jsonb_object_keys(combined)), 'Exact enclosing envelope');
  perform pg_temp.route_assert((select count(*) = 12 from jsonb_object_keys(combined->'route_comparison')), 'Exact comparison allowlist');
end;
$$;
reset role;

create temp table route_clock as select statement_timestamp() + interval '1 hour' as read_at;
select set_config('route_test.clock',read_at::text,true) from route_clock;
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.read_traffic_demo()'::regprocedure);
  perform pg_temp.route_assert(position('statement_timestamp()' in definition) > 0, 'Only the underlying statement read clock is replaced');
  execute replace(definition,'statement_timestamp()', 'current_setting(''route_test.clock'')::timestamptz');
end;
$$;
delete from public.demo_traffic_corridors where id = 'mangaluru-central-v1';
insert into public.demo_traffic_corridors select 'mangaluru-central-v1','SIMULATED route test','simulated','Synthetic','slowdown',read_at - interval '5 minutes' from route_clock;
insert into public.demo_traffic_segments
  select 'mangaluru-central-v1',id,'SIMULATED ' || id,'outbound','{"type":"LineString","coordinates":[[74.85,12.87],[74.86,12.88]]}'::jsonb,length_m,baseline,'Route test baseline'
  from (values ('primary-west',1500,180),('primary-east',1000,120),('alternative-west',2200,240),('alternative-east',1200,180)) s(id,length_m,baseline);
insert into public.demo_traffic_routes values
  ('mangaluru-central-v1','primary','SIMULATED primary','primary','outbound'),
  ('mangaluru-central-v1','alternative','SIMULATED alternative','alternative','outbound');
insert into public.demo_traffic_route_segments values
  ('mangaluru-central-v1','primary','primary-west',1,'outbound'),('mangaluru-central-v1','primary','primary-east',2,'outbound'),
  ('mangaluru-central-v1','alternative','alternative-west',1,'outbound'),('mangaluru-central-v1','alternative','alternative-east',2,'outbound');

create function pg_temp.route_fixture(savings_us bigint default 300000000,
  segment_ids text[] default array['primary-west','primary-east','alternative-west','alternative-east'],
  acceptance_offset integer default 0, complete boolean default true, east_speed numeric default 30,
  alternative_speed numeric default 24, run_uuid uuid default gen_random_uuid(), batch_uuid uuid default gen_random_uuid())
returns uuid language plpgsql as $$
declare r uuid := run_uuid; b uuid := batch_uuid; c timestamptz; entry timestamptz; s record; source text;
begin
  select read_at into c from route_clock;
  insert into public.speed_evidence_runs values(r,'mangaluru-central-v1',c - interval '3 minutes','simulated');
  insert into public.speed_evidence_segments select r,id,direction,length_m,baseline_seconds,baseline_label from public.demo_traffic_segments where id = any(segment_ids);
  insert into public.speed_evidence_sources select r,id || '-source-' || n,id,direction,'SIMULATED route test source'
    from public.demo_traffic_segments cross join generate_series(1,3) n where id = any(segment_ids);
  insert into public.speed_evidence_batches values(r,b,c - interval '5 minutes',c - interval '2 minutes' + acceptance_offset * interval '1 second',sha256('route test'),cardinality(segment_ids)*36,cardinality(segment_ids)*36);
  insert into public.speed_evidence_observations
    select r,source_id,c - interval '16 minutes' + n * interval '1 minute',segment_id,direction,
      case segment_id when 'primary-west' then case when n < 5 then case when savings_us > 300000000 then 0 else 18 end else 9 end
        when 'primary-east' then east_speed when 'alternative-west' then 33 else alternative_speed end,b
    from public.speed_evidence_sources cross join generate_series(0,11) n where run_id = r;
  insert into public.speed_evidence_batch_samples
    select r,b,source_id,observed_at,row_number() over(order by source_id,observed_at)::integer from public.speed_evidence_observations where run_id = r;
  if complete then
    for s in select * from public.speed_evidence_segments where run_id = r loop
      source := s.segment_id || '-source-1';
      entry := c - interval '11 minutes' - case when s.segment_id = 'primary-west' then abs(savings_us - 300000000) else 0 end * interval '1 microsecond';
      insert into public.completed_traversals values(gen_random_uuid(),r,b,source,s.segment_id,s.direction,entry,
        public.expected_completed_traversal_exit(r,b,source,s.segment_id,s.direction,entry),s.length_m,c - interval '1 second');
    end loop;
  end if;
  return r;
end;
$$;
create function pg_temp.route_unavailable(expected text) returns void language plpgsql as $$
declare v jsonb := public.read_traffic_phase5()->'route_comparison';
begin
  perform pg_temp.route_assert(v->>'status' = expected, 'Expected ' || expected || ', got ' || (v->>'status'));
  perform pg_temp.route_assert(v->'primary_duration_us' = 'null' and v->'alternative_duration_us' = 'null'
    and v->'savings_us' = 'null' and v->'valid_until' = 'null' and v->'supported_incident_ids' = '[]', 'Unavailable never publishes numbers, deadline or incident references');
end;
$$;

savepoint threshold_cases;
do $$
declare n bigint; r uuid; v jsonb; current_ids jsonb;
begin
  foreach n in array array[299000000,299999999,300000000,300000001]::bigint[] loop
    r := pg_temp.route_fixture(n,acceptance_offset := (n - 299000000)::integer / 1000000);
    v := public.read_traffic_phase5();
    perform pg_temp.route_assert(v->'route_comparison'->>'status' = 'available', 'Real verified motion is available');
    perform pg_temp.route_assert((v->'route_comparison'->>'savings_us')::bigint = n, 'Exact microsecond threshold ' || n);
    perform pg_temp.route_assert((v->'route_comparison'->>'primary_duration_us')::bigint = 420000000 + n
      and (v->'route_comparison'->>'alternative_duration_us')::bigint = 420000000, 'Actual route elapsed sums');
    select coalesce(jsonb_agg(i->'id' order by i->>'id'),'[]') into current_ids from jsonb_array_elements(v->'phase4'->'incidents') i
      join public.incident_lifecycle_cycles c on c.id = (i->>'id')::uuid
      where c.run_id = r and i->>'state' = 'supported' and (i->>'is_current')::boolean and i->>'segment_id' in ('primary-west','primary-east');
    perform pg_temp.route_assert(jsonb_array_length(current_ids) > 0 and v->'route_comparison'->'supported_incident_ids' = current_ids, 'Exact same-run current supported primary cycles only');
    perform pg_temp.route_assert((v->'route_comparison'->>'valid_until')::timestamptz =
      (select min(entered_at) + interval '20 minutes' from public.completed_traversals where run_id = r), 'Earliest exact traversal deadline');
    delete from public.speed_evidence_runs where run_id = r;
  end loop;
  r := pg_temp.route_fixture(east_speed := 60);
  v := public.read_traffic_phase5()->'route_comparison';
  perform pg_temp.route_assert((v->>'primary_duration_us')::bigint = 660000000 and (v->>'savings_us')::bigint = 240000000, 'Faster-than-baseline completion never clamps actual elapsed');
end;
$$;
rollback to threshold_cases;

savepoint supported_membership;
do $$
declare r uuid := pg_temp.route_fixture(east_speed := 9, alternative_speed := 9); v jsonb;
begin
  v := public.read_traffic_phase5();
  perform pg_temp.route_assert(v->'route_comparison'->>'status' = 'available', 'Comparison availability does not invent a hazard decision');
  perform pg_temp.route_assert((select count(*) = 3 from jsonb_array_elements(v->'phase4'->'incidents') i
    where i->>'state' = 'supported' and (i->>'is_current')::boolean), 'Actual slow motion supports two primary segments and one alternative');
  perform pg_temp.route_assert(jsonb_array_length(v->'route_comparison'->'supported_incident_ids') = 2
    and not exists(select 1 from jsonb_array_elements_text(v->'route_comparison'->'supported_incident_ids') i
      join public.incident_lifecycle_cycles c on c.id = i::uuid where c.run_id <> r or c.segment_id not in ('primary-west','primary-east')),
    'Include every exact primary support and exclude alternative support');
end;
$$;
rollback to supported_membership;

savepoint latest_ties;
do $$
declare low_id uuid; high_id uuid; full_run uuid; partial_run uuid; shared_batch uuid; tie_kind integer;
begin
  for tie_kind in 1..4 loop
    low_id := gen_random_uuid(); high_id := gen_random_uuid();
    if low_id > high_id then shared_batch := low_id; low_id := high_id; high_id := shared_batch; end if;
    shared_batch := gen_random_uuid();
    if tie_kind <= 2 then
      full_run := pg_temp.route_fixture(batch_uuid := case when tie_kind = 1 then high_id else low_id end);
      partial_run := pg_temp.route_fixture(segment_ids := array['primary-west'], batch_uuid := case when tie_kind = 1 then low_id else high_id end);
    else
      full_run := pg_temp.route_fixture(run_uuid := case when tie_kind = 3 then high_id else low_id end, batch_uuid := shared_batch);
      partial_run := pg_temp.route_fixture(segment_ids := array['primary-west'], run_uuid := case when tie_kind = 3 then low_id else high_id end, batch_uuid := shared_batch);
    end if;
    if tie_kind in (1,3) then
      perform pg_temp.route_assert(public.read_traffic_phase5()->'route_comparison'->>'status' = 'available', 'Latest batch/run UUID ordering prefers full run, not insertion order');
    else
      perform pg_temp.route_unavailable('mixed_runs');
    end if;
    delete from public.speed_evidence_runs where run_id in (full_run,partial_run);
  end loop;
end;
$$;
rollback to latest_ties;

savepoint unavailable_cases;
select pg_temp.route_fixture();
select pg_temp.route_assert(public.read_traffic_phase5()->'route_comparison'->>'status' = 'available','Full run starts available');
select pg_temp.route_fixture(segment_ids := array['primary-west'],acceptance_offset := 1);
select pg_temp.route_unavailable('mixed_runs');
select pg_temp.route_assert((public.read_traffic_phase4()->'traversals' @> '[{"segment_id":"primary-west","status":"available"}]')
  and public.read_traffic_phase5()->'route_comparison'->>'status' = 'mixed_runs','Individually available runs must not combine');
select pg_temp.route_fixture(acceptance_offset := 2,complete := false);
select pg_temp.route_unavailable('missing');
rollback to unavailable_cases;

savepoint fixed_membership;
select pg_temp.route_fixture();
do $$
declare route_name text; other_route text; variant text; expected_ids jsonb; v jsonb;
begin
  foreach route_name in array array['primary','alternative'] loop
    other_route := case when route_name = 'primary' then 'alternative' else 'primary' end;
    foreach variant in array array['removed','substituted','reordered'] loop
      if variant = 'removed' then
        delete from public.demo_traffic_route_segments where route_id = route_name and position = 2;
        expected_ids := jsonb_build_array(route_name || '-west');
      elsif variant = 'substituted' then
        update public.demo_traffic_route_segments set segment_id = other_route || '-east' where route_id = route_name and position = 2;
        expected_ids := jsonb_build_array(route_name || '-west', other_route || '-east');
      else
        update public.demo_traffic_route_segments set position = position + 2 where route_id = route_name;
        update public.demo_traffic_route_segments set position = 5 - position where route_id = route_name;
        expected_ids := jsonb_build_array(route_name || '-east', route_name || '-west');
      end if;
      v := public.read_traffic_phase5()->'route_comparison';
      perform pg_temp.route_assert(v->(route_name || '_segment_ids') = expected_ids, variant || ' ' || route_name || ' retains actual membership');
      perform pg_temp.route_assert(v->(other_route || '_segment_ids') = jsonb_build_array(other_route || '-west', other_route || '-east'), 'Other route unchanged');
      perform pg_temp.route_unavailable('incompatible');
      delete from public.demo_traffic_route_segments where route_id = route_name;
      insert into public.demo_traffic_route_segments values
        ('mangaluru-central-v1',route_name,route_name || '-west',1,'outbound'),
        ('mangaluru-central-v1',route_name,route_name || '-east',2,'outbound');
      perform pg_temp.route_assert(public.read_traffic_phase5()->'route_comparison'->>'status' = 'available', 'Exact ordered membership restores availability');
    end loop;
  end loop;
end;
$$;
rollback to fixed_membership;

savepoint substituted_missing_segment;
select pg_temp.route_fixture(segment_ids := array['primary-west','primary-east','alternative-west']);
insert into public.demo_traffic_segments select corridor_id,'route-test-missing',name,direction,geometry,length_m,baseline_seconds,baseline_label from public.demo_traffic_segments where id = 'alternative-east';
update public.demo_traffic_route_segments set segment_id = 'route-test-missing' where segment_id = 'alternative-east';
select pg_temp.route_unavailable('incompatible');
rollback to substituted_missing_segment;

savepoint projections;
select pg_temp.route_fixture();
select set_config('route_test.clock',(read_at - interval '2 seconds')::text,true) from route_clock;
select pg_temp.route_unavailable('future');
select set_config('route_test.clock',(read_at + interval '9 minutes' - interval '1 microsecond')::text,true) from route_clock;
select pg_temp.route_assert(public.read_traffic_phase5()->'route_comparison'->>'status' = 'available','Available immediately before earliest expiry');
select set_config('route_test.clock',(read_at + interval '9 minutes')::text,true) from route_clock;
select pg_temp.route_unavailable('stale');
select set_config('route_test.clock',read_at::text,true) from route_clock;
update public.demo_traffic_segments set baseline_seconds = baseline_seconds + 1 where id = 'alternative-east';
select pg_temp.route_unavailable('incompatible');
rollback to projections;

savepoint invalid_completion;
select pg_temp.route_fixture();
-- A legacy forged latest completion cannot replace a proven earlier completion.
insert into public.completed_traversals
  select gen_random_uuid(),t.run_id,t.batch_id,'primary-west-source-2',t.segment_id,t.direction,
    t.exited_at + interval '1 second',t.exited_at + interval '2 seconds',t.distance_m,t.accepted_at
  from public.completed_traversals t join public.speed_evidence_batches b on b.run_id = t.run_id and b.batch_id = t.batch_id
  where t.segment_id = 'primary-west' order by b.accepted_at desc,b.batch_id desc,b.run_id desc limit 1;
select pg_temp.route_unavailable('invalid');
rollback to invalid_completion;

savepoint missing_route;
select pg_temp.route_fixture();
do $$
declare route_name text; other_route text; v jsonb;
begin
  foreach route_name in array array['primary','alternative'] loop
    other_route := case when route_name = 'primary' then 'alternative' else 'primary' end;
    delete from public.demo_traffic_routes where id = route_name;
    perform pg_temp.route_unavailable('no_routes');
    v := public.read_traffic_phase5()->'route_comparison';
    perform pg_temp.route_assert(v->(route_name || '_segment_ids') = '[]'
      and v->(other_route || '_segment_ids') = jsonb_build_array(other_route || '-west', other_route || '-east'), 'Only missing route has empty membership');
    insert into public.demo_traffic_routes values ('mangaluru-central-v1',route_name,'SIMULATED ' || route_name,route_name,'outbound');
    insert into public.demo_traffic_route_segments values
      ('mangaluru-central-v1',route_name,route_name || '-west',1,'outbound'),
      ('mangaluru-central-v1',route_name,route_name || '-east',2,'outbound');
    perform pg_temp.route_assert(public.read_traffic_phase5()->'route_comparison'->>'status' = 'available', 'Restored route is available');
  end loop;
end;
$$;
rollback to missing_route;
rollback;

begin read only;
set local role anon;
do $$
begin
  perform public.read_traffic_phase5();
end;
$$;
rollback;
