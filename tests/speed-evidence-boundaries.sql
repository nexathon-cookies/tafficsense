-- Run serially with Docker psql; every fixture, role, cap and report mutation rolls back.
-- Precedence: null IDs; missing/empty (existing key conflicts); size (existing key conflicts);
-- identical replay/conflicting key; descriptor/sample/anchor conflict; freshness; global caps.
begin;
set local statement_timeout = '120s';
set local lock_timeout = '5s';
set local timezone = 'UTC';
select pg_advisory_xact_lock(72861, 3);
create function pg_temp.speed_assert(ok boolean, message text)
returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception '%', message; end if;
end;
$$;
select pg_temp.speed_assert(to_regclass('public.speed_evidence_runs') is not null,
  'Apply speed evidence migration before tests; pre-migration failure performs no persistent mutations');

create temp table speed_case as select gen_random_uuid() as run_id, gen_random_uuid() as batch_id;
create temp table speed_before as select 'runs' as kind, count(*) as total from public.speed_evidence_runs
  union all select 'batches', count(*) from public.speed_evidence_batches;
create function pg_temp.speed_fixture(segment_count integer, source_count integer, sample_count integer,
  anchor timestamptz default clock_timestamp() - interval '1 second')
returns void language plpgsql as $$
begin
  delete from public.demo_traffic_corridors where id = 'mangaluru-central-v1';
  insert into public.demo_traffic_corridors values
    ('mangaluru-central-v1', 'Boundary fixture', 'simulated', 'Synthetic', 'normal', anchor);
  insert into public.demo_traffic_segments
    select 'mangaluru-central-v1', 'segment-' || n, 'Synthetic', case when n % 2 = 0 then 'inbound' else 'outbound' end,
      '{"type":"LineString","coordinates":[[74.85,12.87],[74.86,12.88]]}', 1001, 137, 'Exact synthetic baseline'
    from generate_series(1, segment_count) n;
  insert into public.demo_traffic_sources
    select 'mangaluru-central-v1', 'source-' || n, 'segment-' || (1 + (n - 1) % segment_count), 'Synthetic source ' || n
    from generate_series(1, source_count) n;
  insert into public.demo_traffic_observations
    select 'mangaluru-central-v1', s.segment_id, s.id, anchor, anchor - n * interval '1 microsecond', 10.01, 'simulated'
    from generate_series(1, sample_count) n
    join public.demo_traffic_sources s on s.corridor_id = 'mangaluru-central-v1' and s.id = 'source-' || (1 + (n - 1) % source_count);
end;
$$;

-- Security introspection is independent of the service role's RLS bypass.
do $$
declare t text; r text; f text; config text[];
begin
  perform pg_temp.speed_assert((select not rolcanlogin and not rolbypassrls and not rolsuper and not rolinherit
    and not rolcreatedb and not rolcreaterole from pg_roles where rolname = 'speed_evidence_executor'), 'Executor must be restricted');
  perform pg_temp.speed_assert(not exists (select 1 from pg_auth_members m join pg_roles r on r.oid = m.member
    where m.roleid = 'speed_evidence_executor'::regrole and not (r.rolname = 'postgres' and not m.inherit_option and not m.set_option)),
    'Executor membership cannot be inherited or SET by API roles');
  foreach t in array array['runs', 'segments', 'sources', 'batches', 'observations', 'batch_samples'] loop
    t := 'public.speed_evidence_' || t;
    perform pg_temp.speed_assert((select relrowsecurity and relforcerowsecurity and relowner <> 'speed_evidence_executor'::regrole
      from pg_class where oid = t::regclass), 'Forced RLS and non-owner executor required');
    perform pg_temp.speed_assert(has_table_privilege('speed_evidence_executor', t, 'SELECT')
      and has_table_privilege('speed_evidence_executor', t, 'INSERT') and has_table_privilege('speed_evidence_executor', t, 'DELETE')
      and not has_table_privilege('speed_evidence_executor', t, 'UPDATE,TRUNCATE,REFERENCES,TRIGGER'), 'Executor ledger grants are narrow');
    perform pg_temp.speed_assert(has_table_privilege('service_role', t, 'SELECT')
      and not has_table_privilege('service_role', t, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'), 'Service ledger is read-only');
    foreach r in array array['anon', 'authenticated', 'traffic_evidence_reader'] loop
      perform pg_temp.speed_assert(not has_table_privilege(r, t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'), 'No public or reader ledger grants');
    end loop;
    perform pg_temp.speed_assert(not exists (select 1 from information_schema.columns where table_schema = 'public'
      and table_name = split_part(t, '.', 2) and column_name in ('geometry', 'scenario', 'user_id', 'report_id', 'owner_id', 'canonical_input')), 'No private or geometry archive fields');
  end loop;
  foreach t in array array['auth.users', 'public.profiles', 'public.report_sources', 'public.traffic_reports_private', 'public.public_traffic_reports', 'public.incident_episodes'] loop
    perform pg_temp.speed_assert(not has_table_privilege('speed_evidence_executor', t, 'SELECT,INSERT,UPDATE,DELETE'), 'No Auth/private/report grant expansion');
  end loop;
  foreach t in array array['corridors', 'segments', 'sources', 'observations'] loop
    t := 'public.demo_traffic_' || t;
    perform pg_temp.speed_assert(has_table_privilege('speed_evidence_executor', t, 'SELECT')
      and not has_table_privilege('speed_evidence_executor', t, 'INSERT,UPDATE,DELETE,TRUNCATE'), 'Current fixture is read-only to executor');
  end loop;
  foreach f in array array['public.capture_speed_evidence(uuid,uuid)', 'public.check_speed_evidence(uuid,uuid)', 'public.cleanup_speed_evidence(uuid)'] loop
    select proconfig into config from pg_proc where oid = f::regprocedure;
    perform pg_temp.speed_assert(config @> array['search_path=""', 'TimeZone=UTC', 'lock_timeout=5s', 'statement_timeout=15s'], 'RPC settings must be fixed');
    perform pg_temp.speed_assert((select prosecdef and proowner = 'speed_evidence_executor'::regrole from pg_proc where oid = f::regprocedure), 'RPC definer must be restricted executor');
    perform pg_temp.speed_assert(has_function_privilege('service_role', f, 'EXECUTE'), 'Service executes RPC');
    foreach r in array array['anon', 'authenticated', 'traffic_evidence_reader'] loop
      perform pg_temp.speed_assert(not has_function_privilege(r, f, 'EXECUTE'), 'Public execution denied');
    end loop;
  end loop;
  perform pg_temp.speed_assert(not has_schema_privilege('speed_evidence_executor', 'public', 'CREATE'), 'Executor cannot create objects');
end;
$$;

-- The final INSERT fails after its rows exist; its entire RPC subtransaction must unwind.
savepoint final_insert_fault;
create function pg_temp.speed_ledger_snapshot()
returns jsonb language plpgsql as $$
declare t text; result jsonb := '{}'::jsonb; records jsonb;
begin
  foreach t in array array['runs', 'segments', 'sources', 'batches', 'observations', 'batch_samples'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), ''[]''::jsonb) from public.speed_evidence_%I r', t) into records;
    result := result || jsonb_build_object(t, records);
  end loop;
  return result;
end;
$$;
create function pg_temp.speed_fail_final_insert()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Injected final membership insert failure' using errcode = 'PSE01';
end;
$$;
select pg_temp.speed_fixture(2, 3, 5);
do $$
declare
  fault_run_id uuid := gen_random_uuid();
  first_batch uuid := gen_random_uuid();
  next_batch uuid := gen_random_uuid();
  before_rows jsonb;
  first_ack jsonb;
  next_ack jsonb;
  first_samples jsonb;
begin
  before_rows := pg_temp.speed_ledger_snapshot();
  create trigger speed_evidence_final_insert_fault after insert on public.speed_evidence_batch_samples
    for each statement execute function pg_temp.speed_fail_final_insert();
  begin
    perform public.capture_speed_evidence(fault_run_id, first_batch);
    raise exception 'Initial capture must reach the injected final INSERT failure';
  exception when sqlstate 'PSE01' then null;
  end;
  perform pg_temp.speed_assert(pg_temp.speed_ledger_snapshot() = before_rows, 'Failed initial capture leaves all six tables exactly unchanged');
  perform pg_temp.speed_assert(public.check_speed_evidence(fault_run_id, first_batch) = '{"status":"not_found"}', 'Failed initial capture has no acknowledgement');
  drop trigger speed_evidence_final_insert_fault on public.speed_evidence_batch_samples;
  first_ack := public.capture_speed_evidence(fault_run_id, first_batch);
  perform pg_temp.speed_assert(first_ack ->> 'status' = 'accepted' and first_ack ->> 'replayed' = 'false'
    and first_ack ->> 'observation_count' = '5' and first_ack ->> 'inserted_observation_count' = '5', 'The same initial IDs succeed after removing the fault');
  perform pg_temp.speed_assert(public.capture_speed_evidence(fault_run_id, first_batch) = first_ack || '{"replayed":true}'::jsonb, 'Initial retry commits only once');
  select jsonb_agg(to_jsonb(o) order by o.source_id, o.observed_at) into first_samples
    from public.speed_evidence_observations o where o.run_id = fault_run_id and o.first_batch_id = first_batch;

  insert into public.demo_traffic_observations
    select corridor_id, segment_id, source_id, anchor_at, observed_at - interval '1 second', speed_kph, provenance
    from public.demo_traffic_observations where corridor_id = 'mangaluru-central-v1' order by observed_at limit 1;
  before_rows := pg_temp.speed_ledger_snapshot();
  create trigger speed_evidence_final_insert_fault after insert on public.speed_evidence_batch_samples
    for each statement execute function pg_temp.speed_fail_final_insert();
  begin
    perform public.capture_speed_evidence(fault_run_id, next_batch);
    raise exception 'Overlapping append must reach the injected final INSERT failure';
  exception when sqlstate 'PSE01' then null;
  end;
  perform pg_temp.speed_assert(pg_temp.speed_ledger_snapshot() = before_rows, 'Failed overlapping append leaves all six tables exactly unchanged');
  perform pg_temp.speed_assert(public.check_speed_evidence(fault_run_id, next_batch) = '{"status":"not_found"}', 'Failed append has no acknowledgement');
  perform pg_temp.speed_assert(public.check_speed_evidence(fault_run_id, first_batch) = first_ack || '{"replayed":true}'::jsonb, 'Failed append retains the first acknowledgement');
  drop trigger speed_evidence_final_insert_fault on public.speed_evidence_batch_samples;
  next_ack := public.capture_speed_evidence(fault_run_id, next_batch);
  perform pg_temp.speed_assert(next_ack ->> 'status' = 'accepted' and next_ack ->> 'replayed' = 'false'
    and next_ack ->> 'observation_count' = '6' and next_ack ->> 'inserted_observation_count' = '1', 'The same append IDs succeed with deduplicated samples');
  perform pg_temp.speed_assert(public.capture_speed_evidence(fault_run_id, next_batch) = next_ack || '{"replayed":true}'::jsonb, 'Append retry commits only once');
  perform pg_temp.speed_assert(public.check_speed_evidence(fault_run_id, first_batch) = first_ack || '{"replayed":true}'::jsonb, 'Successful append retains the first acknowledgement');
  perform pg_temp.speed_assert((select jsonb_agg(to_jsonb(o) order by o.source_id, o.observed_at)
    from public.speed_evidence_observations o where o.run_id = fault_run_id and o.first_batch_id = first_batch) = first_samples,
    'Overlapping samples retain exact original rows and first-batch metadata');
  perform pg_temp.speed_assert((select count(*) = 2 from public.speed_evidence_batches b where b.run_id = fault_run_id)
    and (select count(*) = 6 from public.speed_evidence_observations o where o.run_id = fault_run_id)
    and (select count(*) = 1 from public.speed_evidence_observations o where o.run_id = fault_run_id and o.first_batch_id = next_batch)
    and (select count(*) = 11 from public.speed_evidence_batch_samples s where s.run_id = fault_run_id), 'Fault recovery leaves exactly two batches, six samples and eleven memberships');
end;
$$;
rollback to final_insert_fault;

select pg_temp.speed_fixture(2, 3, 5);
select public.capture_speed_evidence(run_id, batch_id) from speed_case;
do $$
declare c speed_case%rowtype; ack jsonb; t text;
begin
  select * into c from speed_case;
  ack := public.check_speed_evidence(c.run_id, c.batch_id);
  perform pg_temp.speed_assert(ack ->> 'status' = 'accepted' and (ack ->> 'replayed')::boolean, 'Check returns original accepted ack');
  perform pg_temp.speed_assert((select count(*) = 5 from public.speed_evidence_observations where run_id = c.run_id), 'All observations archived');
  perform pg_temp.speed_assert(not exists (select 1 from public.demo_traffic_observations d
    left join public.speed_evidence_observations o on o.run_id = c.run_id and o.source_id = d.source_id and o.observed_at = d.observed_at
    where d.corridor_id = 'mangaluru-central-v1' and (o.source_id is null or o.speed_kph is distinct from d.speed_kph)), 'Exact numeric and microsecond preservation');
  perform pg_temp.speed_assert((select bool_and(length_m = 1001 and baseline_seconds = 137) from public.speed_evidence_segments where run_id = c.run_id), 'Baselines must not be converted to speeds');
  perform pg_temp.speed_assert((select bool_and(o.observed_at > b.accepted_at - interval '20 minutes' and o.observed_at <= b.accepted_at)
    from public.speed_evidence_observations o join public.speed_evidence_batches b on b.run_id = o.run_id and b.batch_id = o.first_batch_id
    where o.run_id = c.run_id), 'Every retained sample is fresh at actual post-lock acceptance');
  perform pg_temp.speed_assert((select array_agg(source_id || observed_at order by ordinal) =
    array_agg(source_id || observed_at order by source_id collate "C", observed_at)
    from public.speed_evidence_batch_samples where run_id = c.run_id), 'Membership order is canonical');
  foreach t in array array['runs', 'segments', 'sources', 'batches', 'observations', 'batch_samples'] loop
    begin
      execute format('update public.speed_evidence_%I set run_id = run_id where run_id = $1', t) using c.run_id;
      raise exception 'Immutable update unexpectedly succeeded: %', t;
    exception when check_violation then null;
    end;
  end loop;
end;
$$;

-- Grant UPDATE only inside this rollback transaction to prove the trigger is a second boundary.
savepoint immutable_role;
grant speed_evidence_executor to postgres with set true;
grant update on public.speed_evidence_runs to speed_evidence_executor;
create policy "Boundary update probe" on public.speed_evidence_runs for update to speed_evidence_executor using (true);
set local role speed_evidence_executor;
do $$
begin
  begin
    update public.speed_evidence_runs set created_at = created_at;
    raise exception 'Executor update unexpectedly succeeded';
  exception when check_violation then null;
  end;
end;
$$;
reset role;
rollback to immutable_role;

-- Changes to omitted display/geometry fields do not change evidence identity.
update public.demo_traffic_corridors set name = 'Changed display', scenario = 'recovery' where id = 'mangaluru-central-v1';
update public.demo_traffic_segments set name = 'Changed display' where corridor_id = 'mangaluru-central-v1';
select pg_temp.speed_assert((public.capture_speed_evidence(run_id, batch_id) ->> 'replayed')::boolean, 'Display-only changes replay') from speed_case;

-- Full report cleanup is tested only in a rollback savepoint, never committed.
savepoint report_cleanup;
update public.reporting_settings set enabled = false;
select public.cleanup_traffic_reports(null);
select pg_temp.speed_assert(public.check_speed_evidence(run_id, batch_id) ->> 'status' = 'accepted', 'Full report cleanup must preserve evidence') from speed_case;
rollback to report_cleanup;

savepoint missing_fixture;
delete from public.demo_traffic_corridors where id = 'mangaluru-central-v1';
insert into public.demo_traffic_corridors values ('other-corridor', 'Other', 'simulated', 'Synthetic', 'normal', clock_timestamp());
select pg_temp.speed_assert(public.capture_speed_evidence(gen_random_uuid(), gen_random_uuid()) = '{"status":"unavailable"}', 'Wrong corridor is unavailable');
select pg_temp.speed_assert(public.capture_speed_evidence(run_id, batch_id) = '{"status":"conflict"}', 'Reset conflicts with retained key') from speed_case;
select pg_temp.speed_assert(public.check_speed_evidence(run_id, batch_id) ->> 'status' = 'accepted', 'Check survives reset') from speed_case;
rollback to missing_fixture;

-- A transaction-local copy changes only the clock read; no deployed clock API exists.
-- The HTTP suite exercises the real clock and restricted executor separately.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.capture_speed_evidence(uuid,uuid)'::regprocedure);
  perform pg_temp.speed_assert(position('accepted := clock_timestamp();' in definition) > 0, 'Boundary copy must replace exactly the internal clock read');
  definition := replace(definition, 'public.capture_speed_evidence(', 'pg_temp.capture_speed_evidence(');
  definition := replace(definition, 'accepted := clock_timestamp();', 'accepted := current_setting(''speed_evidence_test.clock'')::timestamptz;');
  execute definition;
end;
$$;
savepoint exact_freshness;
select set_config('speed_evidence_test.clock', '2026-10-16T10:00:00.123456Z', true);
select pg_temp.speed_fixture(1, 1, 1, '2026-10-16T09:40:00.123457Z');
select pg_temp.speed_assert(pg_temp.capture_speed_evidence(gen_random_uuid(), gen_random_uuid()) = '{"status":"invalid"}', 'Exact twenty-minute boundary rejected');
select pg_temp.speed_fixture(1, 1, 1, '2026-10-16T09:40:00.123458Z');
select pg_temp.speed_assert(pg_temp.capture_speed_evidence(gen_random_uuid(), gen_random_uuid()) ->> 'status' = 'accepted', 'Twenty minutes minus one microsecond accepted');
select pg_temp.speed_fixture(1, 1, 1, '2026-10-16T10:00:00.123458Z');
select pg_temp.speed_assert(pg_temp.capture_speed_evidence(gen_random_uuid(), gen_random_uuid()) = '{"status":"invalid"}', 'One microsecond in future rejected');
select pg_temp.speed_fixture(1, 1, 1, '2026-10-16T10:00:00.123457Z');
create temp table speed_exact as select gen_random_uuid() as run_id, gen_random_uuid() as batch_id;
select pg_temp.speed_assert(pg_temp.capture_speed_evidence(run_id, batch_id) ->> 'status' = 'accepted', 'Exactly at acceptance clock accepted') from speed_exact;
select set_config('speed_evidence_test.clock', '2026-10-16T10:21:00.123456Z', true);
select pg_temp.speed_assert((pg_temp.capture_speed_evidence(run_id, batch_id) ->> 'replayed')::boolean, 'Identical aged batch replays before freshness') from speed_exact;
select pg_temp.speed_assert(pg_temp.capture_speed_evidence(run_id, gen_random_uuid()) = '{"status":"invalid"}', 'Aged new batch rejected') from speed_exact;
rollback to exact_freshness;

savepoint freshness;
select pg_temp.speed_fixture(1, 1, 1, clock_timestamp() - interval '20 minutes');
select pg_temp.speed_assert(public.capture_speed_evidence(gen_random_uuid(), gen_random_uuid()) = '{"status":"invalid"}', 'Twenty-minute-old input is rejected, not filtered');
select pg_temp.speed_fixture(1, 1, 1, clock_timestamp() + interval '1 minute');
select pg_temp.speed_assert(public.capture_speed_evidence(gen_random_uuid(), gen_random_uuid()) = '{"status":"invalid"}', 'Future sample rejected');
select pg_temp.speed_fixture(1, 1, 0);
select pg_temp.speed_assert(public.capture_speed_evidence(gen_random_uuid(), gen_random_uuid()) = '{"status":"unavailable"}', 'Empty samples unavailable');
rollback to freshness;

savepoint local_caps;
select pg_temp.speed_fixture(50, 500, 5000);
select pg_temp.speed_assert(public.capture_speed_evidence(gen_random_uuid(), gen_random_uuid()) ->> 'status' = 'accepted', 'Exact per-capture maxima accepted');
select pg_temp.speed_fixture(51, 500, 5000);
select pg_temp.speed_assert(public.capture_speed_evidence(gen_random_uuid(), gen_random_uuid()) = '{"status":"limit_reached"}', 'Segment cap plus one rejected');
select pg_temp.speed_fixture(50, 501, 5000);
select pg_temp.speed_assert(public.capture_speed_evidence(gen_random_uuid(), gen_random_uuid()) = '{"status":"limit_reached"}', 'Source cap plus one rejected');
select pg_temp.speed_fixture(50, 500, 5001);
select pg_temp.speed_assert(public.capture_speed_evidence(gen_random_uuid(), gen_random_uuid()) = '{"status":"limit_reached"}', 'Sample cap plus one rejected');
rollback to local_caps;

savepoint run_cap;
insert into public.speed_evidence_runs(run_id, corridor_id, created_at)
  select gen_random_uuid(), 'mangaluru-central-v1', clock_timestamp()
  from generate_series(1, 99 - (select count(*)::integer from public.speed_evidence_runs));
select pg_temp.speed_assert(public.capture_speed_evidence(gen_random_uuid(), gen_random_uuid()) ->> 'status' = 'accepted', 'Hundredth run accepted');
select pg_temp.speed_assert((select count(*) = 100 from public.speed_evidence_runs), 'Run cap reached exactly');
select pg_temp.speed_assert(public.capture_speed_evidence(gen_random_uuid(), gen_random_uuid()) = '{"status":"limit_reached"}', 'Run cap blocks allocations');
select pg_temp.speed_assert((public.capture_speed_evidence(run_id, batch_id) ->> 'replayed')::boolean, 'Replay works at run cap') from speed_case;
select pg_temp.speed_assert(public.capture_speed_evidence(run_id, gen_random_uuid()) ->> 'status' = 'accepted', 'Existing run can append at run cap') from speed_case;
rollback to run_cap;

savepoint batch_cap;
insert into public.speed_evidence_batches(run_id, batch_id, anchor_at, accepted_at, content_digest, observation_count, inserted_observation_count)
  select c.run_id, gen_random_uuid(), b.anchor_at, b.accepted_at, b.content_digest, 1, 0
  from speed_case c join public.speed_evidence_batches b using(run_id, batch_id)
  cross join generate_series(1, 1999 - (select count(*)::integer from public.speed_evidence_batches));
select pg_temp.speed_assert(public.capture_speed_evidence(run_id, gen_random_uuid()) ->> 'status' = 'accepted', 'Two-thousandth batch accepted') from speed_case;
select pg_temp.speed_assert((select count(*) = 2000 from public.speed_evidence_batches), 'Batch cap reached exactly');
select pg_temp.speed_assert(public.capture_speed_evidence(run_id, gen_random_uuid()) = '{"status":"limit_reached"}', 'Batch cap blocks append') from speed_case;
select pg_temp.speed_assert((public.capture_speed_evidence(run_id, batch_id) ->> 'replayed')::boolean, 'Replay works at batch cap') from speed_case;
select pg_temp.speed_assert(public.check_speed_evidence(run_id, batch_id) ->> 'status' = 'accepted', 'Check works at batch cap') from speed_case;
rollback to batch_cap;

savepoint sample_cap;
insert into public.speed_evidence_observations(run_id, source_id, observed_at, segment_id, direction, speed_kph, first_batch_id)
  select c.run_id, 'source-1', b.anchor_at - interval '2 minutes' - n * interval '1 microsecond', 'segment-1', 'outbound', 10.01, c.batch_id
  from speed_case c join public.speed_evidence_batches b using(run_id, batch_id)
  cross join generate_series(1, 99999 - (select count(*)::integer from public.speed_evidence_observations)) n;
insert into public.demo_traffic_observations
  select corridor_id, segment_id, source_id, anchor_at, observed_at - interval '1 second', speed_kph, provenance
  from public.demo_traffic_observations order by observed_at limit 1;
select pg_temp.speed_assert(public.capture_speed_evidence(run_id, gen_random_uuid()) ->> 'status' = 'accepted', 'Hundred-thousandth unique sample accepted') from speed_case;
select pg_temp.speed_assert((select count(*) = 100000 from public.speed_evidence_observations), 'Unique sample cap reached exactly');
select pg_temp.speed_assert(public.capture_speed_evidence(run_id, gen_random_uuid()) ->> 'status' = 'accepted', 'Fully overlapping append allocates no samples at sample cap') from speed_case;
insert into public.demo_traffic_observations
  select corridor_id, segment_id, source_id, anchor_at, observed_at - interval '1 second', speed_kph, provenance
  from public.demo_traffic_observations order by observed_at limit 1;
select pg_temp.speed_assert(public.capture_speed_evidence(run_id, gen_random_uuid()) = '{"status":"limit_reached"}', 'Unique sample cap blocks new evidence') from speed_case;
rollback to sample_cap;

savepoint membership_cap;
insert into public.speed_evidence_batches(run_id, batch_id, anchor_at, accepted_at, content_digest, observation_count, inserted_observation_count)
  select c.run_id, gen_random_uuid(), b.anchor_at, b.accepted_at, b.content_digest, 5000, 0
  from speed_case c join public.speed_evidence_batches b using(run_id, batch_id) cross join generate_series(1, 50);
insert into public.speed_evidence_observations(run_id, source_id, observed_at, segment_id, direction, speed_kph, first_batch_id)
  select c.run_id, 'source-1', b.anchor_at - interval '2 minutes' - n * interval '1 microsecond', 'segment-1', 'outbound', 10.01, c.batch_id
  from speed_case c join public.speed_evidence_batches b using(run_id, batch_id) cross join generate_series(1, 5000) n;
-- This budget-only seed deliberately includes a partial batch, not a captured generation.
do $$
begin
  if exists(select 1 from pg_trigger where tgrelid = 'public.speed_evidence_batch_samples'::regclass and tgname = 'capture_incident_lifecycle') then
    alter table public.speed_evidence_batch_samples disable trigger capture_incident_lifecycle;
  end if;
end;
$$;
insert into public.speed_evidence_batch_samples(run_id, batch_id, source_id, observed_at, ordinal)
  select b.run_id, b.batch_id, o.source_id, o.observed_at,
    row_number() over (partition by b.run_id, b.batch_id order by o.source_id collate "C", o.observed_at)
  from public.speed_evidence_batches b join speed_case c on c.run_id = b.run_id and c.batch_id <> b.batch_id
  cross join lateral (select source_id, observed_at from public.speed_evidence_observations where run_id = c.run_id order by observed_at limit 5000) o
  limit (249995 - (select count(*)::integer from public.speed_evidence_batch_samples));
do $$
begin
  if exists(select 1 from pg_trigger where tgrelid = 'public.speed_evidence_batch_samples'::regclass and tgname = 'capture_incident_lifecycle') then
    alter table public.speed_evidence_batch_samples enable trigger capture_incident_lifecycle;
  end if;
end;
$$;
select pg_temp.speed_assert(public.capture_speed_evidence(run_id, gen_random_uuid()) ->> 'status' = 'accepted', 'Append reaching exact membership cap accepted') from speed_case;
select pg_temp.speed_assert((select count(*) = 250000 from public.speed_evidence_batch_samples), 'Membership cap reached exactly');
select pg_temp.speed_assert(public.capture_speed_evidence(run_id, gen_random_uuid()) = '{"status":"limit_reached"}', 'Membership cap blocks even overlapping append') from speed_case;
select pg_temp.speed_assert((public.capture_speed_evidence(run_id, batch_id) ->> 'replayed')::boolean, 'Replay works at membership cap') from speed_case;
rollback to membership_cap;

select pg_temp.speed_assert(public.cleanup_speed_evidence(run_id) = '{"status":"ready","removed":true}', 'Owned cleanup succeeds') from speed_case;
select pg_temp.speed_assert(public.cleanup_speed_evidence(run_id) = '{"status":"ready","removed":false}', 'Cleanup is idempotent') from speed_case;
select pg_temp.speed_assert((select count(*) from public.speed_evidence_runs) = (select total from speed_before where kind = 'runs'), 'Cleanup preserves all pre-existing runs');
select pg_temp.speed_assert((select count(*) from public.speed_evidence_batches) = (select total from speed_before where kind = 'batches'), 'Cleanup preserves all pre-existing batches');
rollback;
