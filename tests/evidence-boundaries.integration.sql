-- Run serially with psql -X -v ON_ERROR_STOP=1 against the local Docker database.
-- Every fixture, identity, and report in this helper is transaction-local and rolled back.
begin;
set local statement_timeout = '30s';
set local lock_timeout = '5s';

do $$
declare
  reader oid := 'traffic_evidence_reader'::regrole;
  relation record;
  attribute record;
  allowed jsonb := '{
    "traffic_reports_private": ["public_id", "source_id"],
    "report_sources": ["id", "kind", "created_at", "expires_at"],
    "public_traffic_reports": ["id", "segment_id", "direction", "observed_at", "received_at", "provenance", "location_provenance"],
    "demo_traffic_segments": ["corridor_id", "id", "direction"]
  }';
  permitted boolean;
  function_name text;
begin
  if not exists (select 1 from pg_roles where oid = reader and not rolcanlogin and not rolsuper
    and not rolbypassrls and not rolcreatedb and not rolcreaterole and not rolinherit) then
    raise exception 'Evidence role must be a non-login, non-bypassing, non-inheriting reader';
  end if;
  if exists (select 1 from pg_auth_members where member = reader or (roleid = reader and not (
    member = 'postgres'::regrole and grantor = 'supabase_admin'::regrole
    and admin_option and not inherit_option and not set_option
  ))) then
    raise exception 'Evidence role must have no inherited or SET membership; only managed maintenance administration is allowed';
  end if;
  if has_schema_privilege(reader, 'public', 'CREATE') or has_schema_privilege(reader, 'auth', 'USAGE') then
    raise exception 'Evidence reader must have neither schema creation nor Auth access';
  end if;
  if exists (select 1 from pg_class where relowner = reader and relkind in ('r', 'p', 'v', 'm', 'f')) then
    raise exception 'Evidence reader must not own tables or views';
  end if;
  for relation in select c.oid, c.relname, c.relrowsecurity, n.nspname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'auth') and c.relkind in ('r', 'p', 'v', 'm', 'f')
  loop
    if has_table_privilege(reader, relation.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
      raise exception 'Evidence role has a table-level privilege on %.%', relation.nspname, relation.relname;
    end if;
    for attribute in select attname, attnum from pg_attribute
      where attrelid = relation.oid and attnum > 0 and not attisdropped
    loop
      permitted := relation.nspname = 'public' and coalesce(allowed -> relation.relname ? attribute.attname, false);
      if has_column_privilege(reader, relation.oid, attribute.attnum, 'SELECT') is distinct from permitted then
        raise exception 'Unexpected evidence SELECT privilege on %.%.%', relation.nspname, relation.relname, attribute.attname;
      end if;
      if has_column_privilege(reader, relation.oid, attribute.attnum, 'INSERT,UPDATE,REFERENCES') then
        raise exception 'Evidence role has a column write privilege';
      end if;
    end loop;
    if allowed ? relation.relname and relation.nspname = 'public' then
      if not relation.relrowsecurity or not exists (
        select 1 from pg_policy where polrelid = relation.oid and reader = any(polroles) and polcmd = 'r'
      ) then raise exception 'Every evidence relation needs an explicit SELECT RLS policy'; end if;
    end if;
  end loop;
  if not exists (select 1 from pg_proc where oid = 'public.read_report_assessments()'::regprocedure
    and proowner = reader and prosecdef and provolatile = 's' and pronargs = 0
    and prorettype = 'jsonb'::regtype and 'search_path=""' = any(proconfig)) then
    raise exception 'Aggregate RPC must be fixed-shape, stable, definer-owned, and search-path hardened';
  end if;
  if not exists (select 1 from pg_proc where oid = 'public.read_traffic_demo()'::regprocedure
    and not prosecdef and provolatile = 's' and pronargs = 0 and prolang = (select oid from pg_language where lanname = 'sql')) then
    raise exception 'Snapshot wrapper must remain stable SQL security invoker';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'read_report_assessments') <> 1 then
    raise exception 'Aggregate RPC must not expose argument-taking overloads';
  end if;
  if not has_function_privilege('postgres', 'public.read_report_assessments()', 'EXECUTE') then
    raise exception 'Maintenance lint requires aggregate execution without role membership';
  end if;
  foreach function_name in array array['public.prepare_report_source()', 'public.submit_traffic_report(jsonb)',
    'public.cleanup_traffic_reports(uuid[])', 'public.replace_traffic_demo(jsonb)', 'public.reset_traffic_demo()',
    'public.set_reporting_enabled(boolean)', 'public.report_request_claims()', 'public.report_request_user_id()']
  loop
    if has_function_privilege(reader, function_name, 'EXECUTE') then
      raise exception 'Evidence role must not invoke identity or writer functions';
    end if;
  end loop;
end;
$$;

do $$
declare
  read_clock timestamptz := statement_timestamp();
  bucket timestamptz := date_bin(interval '15 minutes', statement_timestamp(), '2000-01-01Z'::timestamptz);
  segment text := 'evidence-boundary-' || gen_random_uuid()::text;
  source_ids uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  user_ids uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  public_ids uuid[] := array[]::uuid[];
  public_id uuid;
  source_index integer;
  observation timestamptz;
  receipt timestamptz;
  assessment jsonb;
  envelope jsonb;
  index integer;
begin
  perform pg_advisory_xact_lock(72861, 3);
  if (select count(*) from public.traffic_reports_private) > 1989
    or (select count(*) from public.report_sources) > 4996 then
    raise exception 'Boundary fixtures need 11 report and 4 source slots; unrelated data is never deleted';
  end if;
  insert into public.demo_traffic_corridors(id, name, provenance, geometry_note, scenario, anchor_at)
    values ('mangaluru-central-v1', 'Synthetic boundary fixture', 'simulated', 'Test-only schematic', 'normal', '2026-10-15T04:00:00Z')
    on conflict (id) do nothing;
  insert into public.report_segment_catalog(id, corridor_id, direction)
    values (segment, 'mangaluru-central-v1', 'outbound');
  insert into public.demo_traffic_segments(corridor_id, id, name, direction, geometry, length_m, baseline_seconds, baseline_label)
    values ('mangaluru-central-v1', segment, 'Synthetic boundary segment', 'outbound',
      '{"type":"LineString","coordinates":[[74.85,12.87],[74.86,12.88]]}', 100, 20, 'Synthetic baseline');
  for index in 1..4 loop
    insert into auth.users(id, is_anonymous) values (user_ids[index], index = 4);
    insert into public.report_sources(id, user_id, kind, created_at, expires_at)
      values (source_ids[index], user_ids[index], case when index = 4 then 'guest' else 'account' end,
        case when index = 4 then read_clock - interval '24 hours'
          when index = 3 then read_clock else read_clock - interval '1 minute' end,
        case when index = 4 then read_clock end);
  end loop;
  for index in 1..11 loop
    source_index := case when index <= 3 then 1 when index = 9 then 4 when index = 10 then 3 else 2 end;
    observation := case index
      when 1 then read_clock - interval '15 minutes'
      when 2 then read_clock - interval '15 minutes' + interval '1 microsecond'
      when 3 then read_clock
      when 4 then read_clock - interval '20 minutes'
      when 5 then read_clock - interval '20 minutes' + interval '1 microsecond'
      when 6 then read_clock - interval '17 minutes'
      when 8 then read_clock + interval '1 microsecond'
      when 11 then read_clock - interval '2 minutes'
      else read_clock - interval '1 minute' end;
    receipt := case index when 7 then read_clock - interval '2 minutes'
      when 8 then read_clock + interval '1 microsecond'
      when 10 then read_clock - interval '30 seconds' else read_clock end;
    public_id := gen_random_uuid();
    public_ids := array_append(public_ids, public_id);
    insert into public.traffic_reports_private(public_id, source_id, request_id, canonical_input, received_at)
      values (public_id, source_ids[source_index], gen_random_uuid(), '{}', receipt);
    insert into public.public_traffic_reports(id, episode_id, segment_id, direction, category, observed_at, received_at)
      values (public_id, public.assign_incident_episode(segment, 'outbound', observation, receipt),
        segment, 'outbound', case when index % 2 = 0 then 'accident' else 'unknown' end, observation, receipt);
  end loop;
  envelope := public.read_traffic_demo();
  select value into assessment from jsonb_array_elements(envelope -> 'report_assessments') where value ->> 'segment_id' = segment;
  if (envelope ->> 'read_at')::timestamptz <> read_clock then raise exception 'Wrapper uses a different statement clock'; end if;
  if assessment is null or assessment - 'valid_until' <> jsonb_build_object(
    'segment_id', segment, 'direction', 'outbound', 'report_count', 11, 'recent_report_count', 8,
    'eligible_report_count', 3, 'eligible_source_count', 2, 'multiple_sources', false, 'provenance', 'simulated'
  ) then raise exception 'Exact 15/20 minute, future, receipt, source creation, or guest-expiry boundary failed'; end if;
  if (assessment ->> 'valid_until')::timestamptz <= read_clock
    or (assessment ->> 'valid_until')::timestamptz > read_clock + interval '1 microsecond'
    or assessment ->> 'valid_until' is null then raise exception 'Earliest microsecond reassessment was missed'; end if;

  delete from public.traffic_reports_private where source_id = any(source_ids);
  if bucket - interval '1 microsecond' <= read_clock - interval '15 minutes'
    or bucket + interval '1 microsecond' > read_clock then
    raise exception 'Boundary test started exactly on a quarter-hour microsecond; rerun without changing the database clock';
  end if;
  for index in 1..4 loop
    source_index := case when index <= 2 then 1 else index - 1 end;
    observation := bucket + case when index = 1 then interval '-1 microsecond' else interval '1 microsecond' end;
    public_id := gen_random_uuid();
    insert into public.traffic_reports_private(public_id, source_id, request_id, canonical_input, received_at)
      values (public_id, source_ids[source_index], gen_random_uuid(), '{}', read_clock);
    insert into public.public_traffic_reports(id, episode_id, segment_id, direction, category, observed_at, received_at)
      values (public_id, public.assign_incident_episode(segment, 'outbound', observation, read_clock),
        segment, 'outbound', 'unknown', observation, read_clock);
  end loop;
  select value into assessment from jsonb_array_elements(public.read_report_assessments()) where value ->> 'segment_id' = segment;
  if (assessment ->> 'eligible_report_count')::integer <> 4 or (assessment ->> 'eligible_source_count')::integer <> 3
    or not (assessment ->> 'multiple_sources')::boolean then
    raise exception 'Distinct sources must span the whole rolling interval, never separate fixed buckets';
  end if;
  if assessment ->> 'valid_until' is null or (assessment ->> 'valid_until')::timestamptz > bucket + interval '15 minutes' - interval '1 microsecond' then
    raise exception 'The earliest duplicate report aging out must invalidate eligible_report_count';
  end if;

  delete from public.traffic_reports_private where source_id = any(source_ids);
  update public.report_sources set created_at = read_clock - interval '24 hours' + interval '30 seconds',
    expires_at = read_clock + interval '30 seconds' where id = source_ids[4];
  public_ids := array[]::uuid[];
  for index in 1..3 loop
    source_index := case when index = 3 then 4 else 1 end;
    observation := read_clock - case index when 1 then interval '14 minutes' when 2 then interval '0 minutes' else interval '1 minute' end;
    public_id := gen_random_uuid();
    public_ids := array_append(public_ids, public_id);
    insert into public.traffic_reports_private(public_id, source_id, request_id, canonical_input, received_at)
      values (public_id, source_ids[source_index], gen_random_uuid(), '{}', read_clock);
    insert into public.public_traffic_reports(id, episode_id, segment_id, direction, category, observed_at, received_at)
      values (public_id, public.assign_incident_episode(segment, 'outbound', observation, read_clock),
        segment, 'outbound', 'unknown', observation, read_clock);
  end loop;
  select value into assessment from jsonb_array_elements(public.read_report_assessments()) where value ->> 'segment_id' = segment;
  if (assessment ->> 'eligible_report_count')::integer <> 3 or (assessment ->> 'eligible_source_count')::integer <> 2
    or assessment ->> 'valid_until' is null or (assessment ->> 'valid_until')::timestamptz > read_clock + interval '30 seconds' then
    raise exception 'Eligible guest expiry must bound reassessment';
  end if;
  update public.report_sources set created_at = read_clock - interval '24 hours', expires_at = read_clock where id = source_ids[4];
  select value into assessment from jsonb_array_elements(public.read_report_assessments()) where value ->> 'segment_id' = segment;
  if (assessment ->> 'report_count')::integer <> 3 or (assessment ->> 'recent_report_count')::integer <> 3
    or (assessment ->> 'eligible_report_count')::integer <> 2 or (assessment ->> 'eligible_source_count')::integer <> 1
    or assessment ->> 'valid_until' is null or (assessment ->> 'valid_until')::timestamptz > read_clock + interval '1 minute' then
    raise exception 'Expiry retains public rows; duplicate aging still needs a deadline';
  end if;
  delete from public.traffic_reports_private r where r.public_id = public_ids[1];
  select value into assessment from jsonb_array_elements(public.read_report_assessments()) where value ->> 'segment_id' = segment;
  if (assessment ->> 'eligible_report_count')::integer <> 1 or (assessment ->> 'eligible_source_count')::integer <> 1 then
    raise exception 'Removing a duplicate must preserve the remaining source contribution';
  end if;

  delete from public.traffic_reports_private where source_id = any(source_ids);
  public_id := gen_random_uuid();
  insert into public.traffic_reports_private(public_id, source_id, request_id, canonical_input, received_at)
    values (public_id, source_ids[1], gen_random_uuid(), '{}', read_clock);
  insert into public.public_traffic_reports(id, episode_id, segment_id, direction, category, observed_at, received_at)
    values (public_id, public.assign_incident_episode(segment, 'outbound', read_clock - interval '21 minutes', read_clock),
      segment, 'outbound', 'unknown', read_clock - interval '21 minutes', read_clock);
  select value into assessment from jsonb_array_elements(public.read_report_assessments()) where value ->> 'segment_id' = segment;
  if (assessment ->> 'report_count')::integer <> 1 or (assessment ->> 'recent_report_count')::integer <> 0
    or (assessment ->> 'eligible_source_count')::integer <> 0 or assessment -> 'valid_until' <> 'null'::jsonb then
    raise exception 'Stale-only groups retain totals without a future deadline';
  end if;
  update public.public_traffic_reports r set observed_at = read_clock + interval '1 minute',
    received_at = read_clock + interval '1 minute' where r.id = public_id;
  select value into assessment from jsonb_array_elements(public.read_report_assessments()) where value ->> 'segment_id' = segment;
  if (assessment ->> 'report_count')::integer <> 1 or (assessment ->> 'recent_report_count')::integer <> 0
    or (assessment ->> 'eligible_report_count')::integer <> 0 or assessment ->> 'valid_until' is null
    or (assessment ->> 'valid_until')::timestamptz <= read_clock
    or (assessment ->> 'valid_until')::timestamptz > read_clock + interval '1 minute' then
    raise exception 'A coherent future receipt needs reassessment when it can first become recent';
  end if;
  delete from public.traffic_reports_private where source_id = any(source_ids);
  select value into assessment from jsonb_array_elements(public.read_report_assessments()) where value ->> 'segment_id' = segment;
  if (assessment ->> 'report_count')::integer <> 0 or (assessment ->> 'recent_report_count')::integer <> 0
    or (assessment ->> 'eligible_report_count')::integer <> 0 or (assessment ->> 'eligible_source_count')::integer <> 0
    or (assessment ->> 'multiple_sources')::boolean or assessment -> 'valid_until' <> 'null'::jsonb then
    raise exception 'Every active segment needs a zero-count assessment even without reports';
  end if;
end;
$$;
rollback;
