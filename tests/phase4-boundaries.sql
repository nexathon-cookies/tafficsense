begin;
select pg_advisory_xact_lock(72861, 3);
create function pg_temp.phase4_assert(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Phase four snapshot: %', label; end if; end;
$$;
select pg_temp.phase4_assert(to_regprocedure('public.read_traffic_phase4()') is not null, 'snapshot RPC exists');
select pg_temp.phase4_assert((select provolatile = 's' and prosecdef from pg_proc where oid = 'public.read_traffic_phase4()'::regprocedure), 'read is stable and restricted definer');
select pg_temp.phase4_assert((select not rolcanlogin and not rolbypassrls and not rolsuper from pg_roles where rolname = 'phase4_snapshot_reader'), 'reader is non-login, non-bypass, non-superuser');
select pg_temp.phase4_assert(not has_schema_privilege('phase4_snapshot_reader', 'public', 'CREATE'), 'reader cannot create');
select pg_temp.phase4_assert(not pg_has_role('postgres','phase4_snapshot_reader','USAGE') and not pg_has_role('postgres','phase4_snapshot_reader','SET'), 'temporary membership removed');
select pg_temp.phase4_assert(not has_table_privilege('phase4_snapshot_reader', 'public.traffic_reports_private', 'SELECT'), 'no private reports');
select pg_temp.phase4_assert(not has_column_privilege('phase4_snapshot_reader', 'public.completed_traversals', 'source_id', 'SELECT'), 'no completion source identities');
select pg_temp.phase4_assert(not has_table_privilege('phase4_snapshot_reader', 'public.speed_evidence_observations', 'SELECT'), 'no ledger samples');
do $$
declare role_name text; table_name text;
begin
  foreach role_name in array array['anon','authenticated','service_role'] loop
    perform pg_temp.phase4_assert(has_function_privilege(role_name,'public.read_traffic_phase4()','EXECUTE'), 'public read allowed');
    perform pg_temp.phase4_assert(not has_function_privilege(role_name,'public.project_incident_lifecycle(timestamptz)','EXECUTE'), 'no lifecycle caller clock');
    perform pg_temp.phase4_assert(not has_function_privilege(role_name,'public.project_completed_traversal(uuid,text,text,timestamptz)','EXECUTE'), 'no traversal caller clock');
  end loop;
  foreach table_name in array array['speed_evidence_batches','speed_evidence_segments','completed_traversals','public_traffic_reports','incident_episodes'] loop
    perform pg_temp.phase4_assert(not has_table_privilege('phase4_snapshot_reader', 'public.' || table_name, 'INSERT,UPDATE,DELETE,TRUNCATE'), 'reader cannot mutate ' || table_name);
  end loop;
end;
$$;
set local role anon;
do $$
declare before_snapshot jsonb; after_snapshot jsonb; combined jsonb;
begin
  before_snapshot := public.read_traffic_demo();
  combined := public.read_traffic_phase4();
  after_snapshot := public.read_traffic_demo();
  perform pg_temp.phase4_assert(combined -> 'traffic' = before_snapshot and before_snapshot = after_snapshot, 'same statement snapshot and no public-read mutation');
  perform pg_temp.phase4_assert((select count(*) = 3 from jsonb_object_keys(combined)), 'exact envelope');
end;
$$;
reset role;
rollback;
