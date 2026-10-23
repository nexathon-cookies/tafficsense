-- Run serially after migration 006; all retained fixtures and probes roll back.
begin;
set local statement_timeout = '120s';
set local lock_timeout = '5s';
set local timezone = 'UTC';
select pg_advisory_xact_lock(72861, 3);
create function pg_temp.motion_assert(ok boolean, message text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception '%', message; end if;
end;
$$;
select pg_temp.motion_assert(to_regprocedure('public.expected_completed_traversal_exit(uuid,uuid,text,text,text,timestamp with time zone)') is not null,
  'Apply traversal motion verification migration before tests');
create temp table motion_clock as select '2026-10-16T10:00:00.123456Z'::timestamptz read_at;
select set_config('traversal_motion_test.clock', read_at::text, true) from motion_clock;
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.ingest_completed_traversal(jsonb)'::regprocedure);
  perform pg_temp.motion_assert(position('accepted := clock_timestamp();' in definition) > 0, 'Only the private acceptance clock is replaced');
  definition := replace(definition, 'public.ingest_completed_traversal(', 'pg_temp.ingest_completed_traversal(');
  definition := replace(definition, 'accepted := clock_timestamp();', 'accepted := current_setting(''traversal_motion_test.clock'')::timestamptz;');
  execute definition;
end;
$$;
create function pg_temp.motion_fixture(speeds numeric[], offsets_us bigint[] default null, length_m integer default 1500,
  baseline_seconds integer default 180, anchor_offset integer default 0)
returns jsonb language plpgsql as $$
declare r uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c timestamptz; first_at timestamptz; terminal_at timestamptz; n integer;
begin
  select read_at into c from motion_clock;
  first_at := c - interval '17 minutes';
  terminal_at := first_at + (cardinality(speeds) - 1) * interval '1 minute' + anchor_offset * interval '1 minute';
  insert into public.speed_evidence_runs values(r,'mangaluru-central-v1',c - interval '1 second','simulated');
  insert into public.speed_evidence_segments values(r,'primary-west','outbound',length_m,baseline_seconds,'Motion test baseline');
  insert into public.speed_evidence_sources values(r,'primary-west-source-1','primary-west','outbound','SIMULATED motion source');
  insert into public.speed_evidence_batches values(r,b,terminal_at,c - interval '1 second',sha256('motion test'),cardinality(speeds),cardinality(speeds));
  for n in 1..cardinality(speeds) loop
    insert into public.speed_evidence_observations values(r,'primary-west-source-1',
      first_at + (n - 1) * interval '1 minute' + coalesce(offsets_us[n],0) * interval '1 microsecond',
      'primary-west','outbound',speeds[n],b);
  end loop;
  insert into public.speed_evidence_batch_samples
    select r,b,o.source_id,o.observed_at,row_number() over(order by o.observed_at)::integer
    from public.speed_evidence_observations o where o.run_id = r;
  return jsonb_build_object('traversal_id',gen_random_uuid(),'run_id',r,'batch_id',b,'source_id','primary-west-source-1',
    'segment_id','primary-west','direction','outbound','entered_at',first_at,'exited_at',first_at + interval '675 seconds',
    'distance_m',length_m,'baseline_seconds',baseline_seconds,'baseline_label','Motion test baseline');
end;
$$;
create function pg_temp.expected_exit(input jsonb) returns timestamptz language sql as $$
  select public.expected_completed_traversal_exit((input->>'run_id')::uuid,(input->>'batch_id')::uuid,input->>'source_id',
    input->>'segment_id',input->>'direction',(input->>'entered_at')::timestamptz)
$$;

do $$
declare payload jsonb; claimed jsonb; correct timestamptz; result jsonb; speed numeric; delta integer;
begin
  payload := pg_temp.motion_fixture(array[8,8,8,8,8,8]::numeric[],null,1500,180,1);
  correct := (payload->>'entered_at')::timestamptz + interval '675 seconds';
  perform pg_temp.motion_assert(pg_temp.expected_exit(payload) = correct, 'Six exact slow samples use the same bounded terminal hold as the browser expiry fixture');
  foreach delta in array array[-674000000,-1,1,1000000] loop
    claimed := payload || jsonb_build_object('exited_at',correct + delta * interval '1 microsecond');
    perform pg_temp.motion_assert(pg_temp.ingest_completed_traversal(claimed) = '{"status":"invalid"}', 'One-second, too-fast and too-slow full-distance claims reject');
    perform pg_temp.motion_assert(public.check_completed_traversal((payload->>'traversal_id')::uuid) = '{"status":"not_found"}', 'Invalid motion never allocates an acknowledgement');
  end loop;
  result := pg_temp.ingest_completed_traversal(payload);
  perform pg_temp.motion_assert(result->>'status' = 'accepted', 'Exact 675-second six-tick completion admitted');
  perform pg_temp.motion_assert(pg_temp.ingest_completed_traversal(payload) = result || '{"replayed":true}'::jsonb, 'Correct completion remains idempotent');

  payload := pg_temp.motion_fixture(array[30,30,30,30,30,8,8,8,8,8,8,8]::numeric[]);
  payload := payload || jsonb_build_object('entered_at',(payload->>'entered_at')::timestamptz + interval '5 minutes',
    'exited_at',(payload->>'entered_at')::timestamptz + interval '5 minutes' + interval '675 seconds');
  perform pg_temp.motion_assert(pg_temp.expected_exit(payload) = (payload->>'exited_at')::timestamptz, 'Original authored twelve-sample slowdown agrees exactly with CLI 675/495');
  perform pg_temp.motion_assert(pg_temp.ingest_completed_traversal(payload) ->> 'status' = 'accepted', 'Original full authored CLI completion remains admissible');
  perform pg_temp.motion_assert(extract(epoch from pg_temp.expected_exit(payload) - (payload->>'entered_at')::timestamptz) - 180 = 495, 'Frozen baseline excess is 495 seconds');

  payload := pg_temp.motion_fixture(array[8,8,8,8,8,8,28,28,28,28,28,28]::numeric[]);
  correct := (payload->>'entered_at')::timestamptz + interval '450 seconds';
  perform pg_temp.motion_assert(pg_temp.expected_exit(payload) = correct, 'Mixed movement integrates 800m slow plus 700m recovered, not latest speed');
  perform pg_temp.motion_assert(pg_temp.ingest_completed_traversal(payload || jsonb_build_object('exited_at',correct)) ->> 'status' = 'accepted', 'Mixed-speed exact completion admitted');

  foreach speed in array array[30::numeric,60::numeric] loop
    payload := pg_temp.motion_fixture(array_fill(speed,array[6]));
    correct := (payload->>'entered_at')::timestamptz + (case when speed = 30 then 180 else 90 end) * interval '1 second';
    perform pg_temp.motion_assert(pg_temp.expected_exit(payload) = correct, 'Normal and faster movement derive their actual durations');
    perform pg_temp.motion_assert(pg_temp.ingest_completed_traversal(payload || jsonb_build_object('exited_at',correct)) ->> 'status' = 'accepted', 'Zero-excess cases still require motion proof');
  end loop;

  payload := pg_temp.motion_fixture(array_fill(7::numeric,array[6]),null,1,1);
  correct := (payload->>'entered_at')::timestamptz + interval '514286 microseconds';
  perform pg_temp.motion_assert(pg_temp.expected_exit(payload) = correct, 'Fractional crossing ceils once to the first exit microsecond');
  perform pg_temp.motion_assert(pg_temp.ingest_completed_traversal(payload || jsonb_build_object('exited_at',correct - interval '1 microsecond')) = '{"status":"invalid"}', 'One microsecond short is not a completion');
  perform pg_temp.motion_assert(pg_temp.ingest_completed_traversal(payload || jsonb_build_object('exited_at',correct)) ->> 'status' = 'accepted', 'First exact exit microsecond admitted');

  payload := pg_temp.motion_fixture(array[0,0,0,0,0,0]::numeric[]);
  perform pg_temp.motion_assert(pg_temp.expected_exit(payload) is null, 'Stationary movement never completes');
  perform pg_temp.motion_assert(pg_temp.ingest_completed_traversal(payload || jsonb_build_object('exited_at',(payload->>'entered_at')::timestamptz + interval '1 second')) = '{"status":"invalid"}', 'Stationary one-second forged zero-delay rejected');
  payload := pg_temp.motion_fixture(array[0,0,30,30,30,30]::numeric[]);
  perform pg_temp.motion_assert(pg_temp.expected_exit(payload) = (payload->>'entered_at')::timestamptz + interval '300 seconds', 'Stopped legs consume elapsed time without distance');
end;
$$;

do $$
declare payload jsonb; samples numeric[]; offset_case bigint[]; first_at timestamptz; anchor timestamptz; b uuid;
begin
  foreach samples slice 1 in array array[array[30,30,30,30,30],array[0,0,0,0,0]]::numeric[][] loop
    payload := pg_temp.motion_fixture(samples);
    perform pg_temp.motion_assert(pg_temp.expected_exit(payload) is null and pg_temp.ingest_completed_traversal(payload) = '{"status":"invalid"}', 'Five samples cannot establish a motion schedule');
  end loop;
  payload := pg_temp.motion_fixture(array[30]::numeric[]);
  perform pg_temp.motion_assert(pg_temp.expected_exit(payload) is null and pg_temp.ingest_completed_traversal(payload) = '{"status":"invalid"}', 'Single-point full-distance forgery rejected');
  foreach offset_case slice 1 in array array[array[0,0,1,0,0,0],array[0,0,60000000,60000000,60000000,60000000],array[0,0,-1,0,0,0],array[-1,-1,-1,-1,-1,-1]]::bigint[][] loop
    payload := pg_temp.motion_fixture(array_fill(30::numeric,array[6]),offset_case);
    perform pg_temp.motion_assert(pg_temp.expected_exit(payload) is null, 'Gaps and microsecond off-grid rows reject the whole schedule');
    perform pg_temp.motion_assert(pg_temp.ingest_completed_traversal(payload) = '{"status":"invalid"}', 'Bad cadence cannot be bypassed through direct ingestion');
  end loop;
  payload := pg_temp.motion_fixture(array_fill(8::numeric,array[6]));
  first_at := (payload->>'entered_at')::timestamptz;
  perform pg_temp.motion_assert(pg_temp.expected_exit(payload || jsonb_build_object('entered_at',first_at - interval '1 microsecond')) is null, 'Entry cannot precede the first retained point');
  select anchor_at into anchor from public.speed_evidence_batches where run_id = (payload->>'run_id')::uuid and batch_id = (payload->>'batch_id')::uuid;
  perform pg_temp.motion_assert(pg_temp.expected_exit(payload || jsonb_build_object('entered_at',anchor + interval '20 minutes' - interval '675 seconds')) = anchor + interval '20 minutes', 'Exact terminal schedule boundary is inclusive for completion');
  perform pg_temp.motion_assert(pg_temp.expected_exit(payload || jsonb_build_object('entered_at',anchor + interval '20 minutes' - interval '675 seconds' + interval '1 microsecond')) is null, 'No extrapolation one microsecond beyond terminal bound');
  perform pg_temp.motion_assert(pg_temp.expected_exit(payload || '{"direction":"inbound"}'::jsonb) is null, 'Exact directed source binding required');
  perform pg_temp.motion_assert(pg_temp.expected_exit(payload || jsonb_build_object('run_id',gen_random_uuid())) is null, 'No cross-run source borrowing');
  b := gen_random_uuid();
  insert into public.speed_evidence_batches select run_id,b,anchor_at,accepted_at,sha256('partial membership'),1,0
    from public.speed_evidence_batches where run_id = (payload->>'run_id')::uuid and batch_id = (payload->>'batch_id')::uuid;
  insert into public.speed_evidence_batch_samples values((payload->>'run_id')::uuid,b,'primary-west-source-1',first_at,1);
  perform pg_temp.motion_assert(pg_temp.expected_exit(payload || jsonb_build_object('batch_id',b)) is null, 'Only selected batch memberships count, not all retained run samples');
end;
$$;

-- Projection exposes only proven elapsed time; malformed legacy rows cannot publish even zero delay.
savepoint legacy_projection;
delete from public.demo_traffic_corridors where id = 'mangaluru-central-v1';
insert into public.demo_traffic_corridors select 'mangaluru-central-v1','SIMULATED','simulated','Synthetic','normal',read_at from motion_clock;
insert into public.demo_traffic_segments values('mangaluru-central-v1','primary-west','SIMULATED','outbound',
  '{"type":"LineString","coordinates":[[74.85,12.87],[74.86,12.88]]}',1500,180,'Motion test baseline');
do $$
declare payload jsonb; first_at timestamptz; c timestamptz; summary jsonb; speed numeric;
begin
  select read_at into c from motion_clock;
  foreach speed in array array[30::numeric,60::numeric] loop
    payload := pg_temp.motion_fixture(array_fill(speed,array[6]));
    payload := payload || jsonb_build_object('exited_at',pg_temp.expected_exit(payload));
    perform pg_temp.motion_assert(pg_temp.ingest_completed_traversal(payload)->>'status' = 'accepted', 'Proven normal/faster completion admitted');
    summary := public.project_completed_traversal((payload->>'run_id')::uuid,'primary-west','outbound',c);
    perform pg_temp.motion_assert(summary->>'state' = 'available' and (summary->>'delay_seconds')::numeric = 0, 'Only proven normal/faster motion publishes zero delay');
  end loop;
  payload := pg_temp.motion_fixture(array[0,0,0,0,0,30]::numeric[]);
  first_at := (payload->>'entered_at')::timestamptz;
  payload := payload || jsonb_build_object('entered_at',first_at + interval '300 seconds' - interval '1 microsecond',
    'exited_at',first_at + interval '480 seconds');
  perform pg_temp.motion_assert(pg_temp.expected_exit(payload) = (payload->>'exited_at')::timestamptz, 'One stationary microsecond precedes exactly 180 seconds of forward motion');
  perform pg_temp.motion_assert(pg_temp.ingest_completed_traversal(payload)->>'status' = 'accepted', 'Genuine microsecond excess admitted');
  summary := public.project_completed_traversal((payload->>'run_id')::uuid,'primary-west','outbound',c);
  perform pg_temp.motion_assert(summary->>'state' = 'available' and (summary->>'elapsed_seconds')::numeric = 180.000001
    and (summary->>'delay_seconds')::numeric = 0.000001, 'Projection preserves exact microsecond excess from retained motion');
end;
$$;
do $$
declare payload jsonb := pg_temp.motion_fixture(array_fill(8::numeric,array[6])); c timestamptz; summary jsonb;
begin
  select read_at into c from motion_clock;
  insert into public.completed_traversals values((payload->>'traversal_id')::uuid,(payload->>'run_id')::uuid,(payload->>'batch_id')::uuid,
    'primary-west-source-1','primary-west','outbound',(payload->>'entered_at')::timestamptz,
    (payload->>'entered_at')::timestamptz + interval '1 second',1500,c);
  summary := public.project_completed_traversal((payload->>'run_id')::uuid,'primary-west','outbound',c);
  perform pg_temp.motion_assert(summary->>'state' = 'invalid' and summary->'delay_seconds' = 'null', 'Legacy forged full distance cannot project zero delay');
  perform pg_temp.motion_assert(pg_temp.ingest_completed_traversal(payload || jsonb_build_object('exited_at',(payload->>'entered_at')::timestamptz + interval '1 second')) = '{"status":"invalid"}', 'Legacy unverified identity cannot replay as accepted admission');
end;
$$;
rollback to legacy_projection;

do $$
declare r text; f text := 'public.expected_completed_traversal_exit(uuid,uuid,text,text,text,timestamp with time zone)';
begin
  foreach r in array array['anon','authenticated','service_role','traffic_evidence_reader'] loop
    perform pg_temp.motion_assert(not has_function_privilege(r,f,'EXECUTE'), 'No direct public/service motion helper access');
  end loop;
  perform pg_temp.motion_assert(has_function_privilege('traversal_reader',f,'EXECUTE'), 'Restricted projection can revalidate legacy records');
  perform pg_temp.motion_assert((select prosecdef and provolatile = 's' and proowner = 'traversal_executor'::regrole from pg_proc where oid = f::regprocedure), 'Stable verifier has the restricted synthetic executor');
  perform pg_temp.motion_assert(not has_table_privilege('traversal_reader','public.speed_evidence_observations','SELECT'), 'Projection gets no raw sample grants');
end;
$$;
rollback;
