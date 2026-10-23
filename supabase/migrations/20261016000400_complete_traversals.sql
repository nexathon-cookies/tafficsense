create role traversal_executor nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create role traversal_reader nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant traversal_executor, traversal_reader to postgres;
grant usage, create on schema public to traversal_executor, traversal_reader;

create table public.completed_traversals (
  traversal_id uuid primary key,
  run_id uuid not null,
  batch_id uuid not null,
  source_id text not null,
  segment_id text not null,
  direction text not null check (direction in ('outbound', 'inbound')),
  entered_at timestamptz not null check (isfinite(entered_at)),
  exited_at timestamptz not null check (isfinite(exited_at)),
  distance_m integer not null check (distance_m between 1 and 100000),
  accepted_at timestamptz not null check (isfinite(accepted_at)),
  unique (run_id, source_id, entered_at),
  check (entered_at < exited_at and exited_at <= accepted_at and entered_at > accepted_at - interval '20 minutes'),
  foreign key (run_id, batch_id) references public.speed_evidence_batches(run_id, batch_id) on delete cascade,
  foreign key (run_id, source_id, segment_id, direction)
    references public.speed_evidence_sources(run_id, source_id, segment_id, direction) on delete cascade
);
create index completed_traversals_directed_latest on public.completed_traversals(run_id, segment_id, direction, exited_at desc, entered_at desc);
create index completed_traversals_batch on public.completed_traversals(run_id, batch_id);
alter table public.completed_traversals enable row level security;
alter table public.completed_traversals force row level security;
revoke all on public.completed_traversals from public, anon, authenticated, service_role;
grant select on public.completed_traversals to service_role, traversal_executor, traversal_reader;
grant insert on public.completed_traversals to traversal_executor;
create policy "Traversal executor reads" on public.completed_traversals for select to traversal_executor using (true);
create policy "Traversal executor inserts" on public.completed_traversals for insert to traversal_executor with check (true);
create policy "Traversal projection reads" on public.completed_traversals for select to traversal_reader using (true);
create trigger immutable_completed_traversal before update on public.completed_traversals
  for each row execute function public.reject_speed_evidence_update();

-- These roles read synthetic evidence only; they have no Auth or reporting-source grants.
do $$
declare table_name text;
begin
  foreach table_name in array array['speed_evidence_runs', 'speed_evidence_segments', 'speed_evidence_batches'] loop
    execute format('grant select on public.%I to traversal_executor, traversal_reader', table_name);
    execute format('create policy "Traversal reads frozen evidence" on public.%I for select to traversal_executor, traversal_reader using (true)', table_name);
  end loop;
  foreach table_name in array array['speed_evidence_sources', 'speed_evidence_observations', 'speed_evidence_batch_samples'] loop
    execute format('grant select on public.%I to traversal_executor', table_name);
    execute format('create policy "Traversal reads bound samples" on public.%I for select to traversal_executor using (true)', table_name);
  end loop;
end;
$$;
grant select on public.demo_traffic_segments to traversal_reader;
create policy "Traversal reads active segments" on public.demo_traffic_segments for select to traversal_reader
  using (corridor_id = 'mangaluru-central-v1');

create function public.check_completed_traversal(p_traversal_id uuid)
returns jsonb language sql stable security definer
set search_path = '' set timezone = 'UTC' set lock_timeout = '5s' set statement_timeout = '15s'
as $$
  select coalesce((select jsonb_build_object('status', 'accepted', 'traversal_id', t.traversal_id,
    'accepted_at', t.accepted_at, 'replayed', true) from public.completed_traversals t where t.traversal_id = p_traversal_id),
    jsonb_build_object('status', case when p_traversal_id is null then 'invalid' else 'not_found' end))
$$;

create function public.read_traversal_context(p_run_id uuid, p_batch_id uuid, p_source_id text)
returns jsonb language sql stable security definer
set search_path = '' set timezone = 'UTC' set lock_timeout = '5s' set statement_timeout = '15s'
as $$
  select coalesce((select jsonb_build_object('status', 'ready', 'run_id', b.run_id, 'batch_id', b.batch_id,
    'source_id', s.source_id, 'anchor_at', b.anchor_at, 'accepted_at', b.accepted_at,
    'segment', jsonb_build_object('segment_id', d.segment_id, 'direction', d.direction, 'length_m', d.length_m,
      'baseline_seconds', d.baseline_seconds, 'baseline_label', d.baseline_label),
    'samples', (select coalesce(jsonb_agg(jsonb_build_object('observed_at', o.observed_at, 'speed_kph', o.speed_kph)
      order by o.observed_at), '[]'::jsonb)
      from public.speed_evidence_batch_samples m join public.speed_evidence_observations o
        on o.run_id = m.run_id and o.source_id = m.source_id and o.observed_at = m.observed_at
      where m.run_id = b.run_id and m.batch_id = b.batch_id and m.source_id = s.source_id))
    from public.speed_evidence_batches b join public.speed_evidence_sources s on s.run_id = b.run_id
    join public.speed_evidence_segments d on d.run_id = s.run_id and d.segment_id = s.segment_id and d.direction = s.direction
    where b.run_id = p_run_id and b.batch_id = p_batch_id and s.source_id = p_source_id
      and exists(select 1 from public.speed_evidence_batch_samples m
        where m.run_id = b.run_id and m.batch_id = b.batch_id and m.source_id = s.source_id)), jsonb_build_object('status', 'not_found'))
$$;

create function public.ingest_completed_traversal(p_traversal jsonb)
returns jsonb language plpgsql security definer
set search_path = '' set timezone = 'UTC' set lock_timeout = '5s' set statement_timeout = '15s'
as $$
declare
  supplied public.completed_traversals%rowtype;
  retained public.completed_traversals%rowtype;
  baseline public.speed_evidence_segments%rowtype;
  batch public.speed_evidence_batches%rowtype;
  expected_baseline integer;
  expected_label text;
  accepted timestamptz;
  field text;
  existing boolean;
begin
  if p_traversal is null or jsonb_typeof(p_traversal) <> 'object' or
    (select array_agg(key order by key) from jsonb_object_keys(p_traversal) key) is distinct from array[
      'baseline_label','baseline_seconds','batch_id','direction','distance_m','entered_at','exited_at','run_id','segment_id','source_id','traversal_id'] then
    return jsonb_build_object('status', 'invalid');
  end if;
  foreach field in array array['traversal_id','run_id','batch_id','source_id','segment_id','direction','entered_at','exited_at','baseline_label'] loop
    if jsonb_typeof(p_traversal -> field) <> 'string' then return jsonb_build_object('status', 'invalid'); end if;
  end loop;
  foreach field in array array['traversal_id','run_id','batch_id'] loop
    if p_traversal ->> field !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      return jsonb_build_object('status', 'invalid');
    end if;
  end loop;
  foreach field in array array['entered_at','exited_at'] loop
    if p_traversal ->> field !~ '^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])[T ]([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?(Z|[+-](0[0-9]|1[0-5]):[0-5][0-9])$' then
      return jsonb_build_object('status', 'invalid');
    end if;
  end loop;
  if p_traversal ->> 'source_id' !~ '^[a-z0-9-]{1,100}$' or p_traversal ->> 'segment_id' !~ '^[a-z0-9-]{1,100}$'
    or p_traversal ->> 'direction' not in ('outbound','inbound')
    or char_length(p_traversal ->> 'baseline_label') not between 1 and 200
    or char_length(btrim(p_traversal ->> 'baseline_label')) = 0 then
    return jsonb_build_object('status', 'invalid');
  end if;
  foreach field in array array['distance_m','baseline_seconds'] loop
    if jsonb_typeof(p_traversal -> field) <> 'number' then return jsonb_build_object('status', 'invalid'); end if;
    if (p_traversal ->> field)::numeric <> trunc((p_traversal ->> field)::numeric)
      or (p_traversal ->> field)::numeric not between 1 and (case when field = 'distance_m' then 100000 else 86400 end) then
      return jsonb_build_object('status', 'invalid');
    end if;
  end loop;
  begin
    supplied.traversal_id := (p_traversal ->> 'traversal_id')::uuid;
    supplied.run_id := (p_traversal ->> 'run_id')::uuid;
    supplied.batch_id := (p_traversal ->> 'batch_id')::uuid;
    supplied.source_id := p_traversal ->> 'source_id';
    supplied.segment_id := p_traversal ->> 'segment_id';
    supplied.direction := p_traversal ->> 'direction';
    supplied.entered_at := (p_traversal ->> 'entered_at')::timestamptz;
    supplied.exited_at := (p_traversal ->> 'exited_at')::timestamptz;
    supplied.distance_m := (p_traversal ->> 'distance_m')::integer;
    expected_baseline := (p_traversal ->> 'baseline_seconds')::integer;
    expected_label := p_traversal ->> 'baseline_label';
  exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation or numeric_value_out_of_range then
    return jsonb_build_object('status', 'invalid');
  end;
  perform pg_advisory_xact_lock(72861, 3);
  accepted := clock_timestamp();
  select * into retained from public.completed_traversals where traversal_id = supplied.traversal_id;
  existing := found;
  if existing and (retained.run_id, retained.batch_id, retained.source_id, retained.segment_id, retained.direction,
    retained.entered_at, retained.exited_at, retained.distance_m) is distinct from
    (supplied.run_id, supplied.batch_id, supplied.source_id, supplied.segment_id, supplied.direction,
    supplied.entered_at, supplied.exited_at, supplied.distance_m) then
    return jsonb_build_object('status', 'conflict');
  end if;
  select * into baseline from public.speed_evidence_segments
    where run_id = supplied.run_id and segment_id = supplied.segment_id and direction = supplied.direction;
  if not found then return jsonb_build_object('status', 'unavailable'); end if;
  if (baseline.length_m, baseline.baseline_seconds, baseline.baseline_label)
    is distinct from (supplied.distance_m, expected_baseline, expected_label) then
    return jsonb_build_object('status', 'conflict');
  end if;
  if existing then return public.check_completed_traversal(supplied.traversal_id); end if;
  if exists(select 1 from public.completed_traversals where run_id = supplied.run_id
    and source_id = supplied.source_id and entered_at = supplied.entered_at) then
    return jsonb_build_object('status', 'conflict');
  end if;
  select * into batch from public.speed_evidence_batches where run_id = supplied.run_id and batch_id = supplied.batch_id;
  if not found or not exists(select 1 from public.speed_evidence_sources s
    join public.speed_evidence_batch_samples m on m.run_id = s.run_id and m.source_id = s.source_id
    where s.run_id = supplied.run_id and s.source_id = supplied.source_id and s.segment_id = supplied.segment_id
      and s.direction = supplied.direction and m.batch_id = supplied.batch_id) then
    return jsonb_build_object('status', 'unavailable');
  end if;
  if not isfinite(supplied.entered_at) or not isfinite(supplied.exited_at)
    or supplied.entered_at < '2000-01-01T00:00:00Z'::timestamptz or supplied.exited_at >= '2100-01-01T00:00:00Z'::timestamptz
    or supplied.entered_at >= supplied.exited_at or supplied.exited_at > accepted
    or supplied.entered_at <= accepted - interval '20 minutes' or batch.accepted_at > accepted or batch.anchor_at > accepted
    or exists(select 1 from public.speed_evidence_runs r where r.run_id = supplied.run_id and r.created_at > accepted) then
    return jsonb_build_object('status', 'invalid');
  end if;
  if (select count(*) from public.completed_traversals) >= 10000
    or (select count(*) from public.completed_traversals where run_id = supplied.run_id) >= 1000 then
    return jsonb_build_object('status', 'limit_reached');
  end if;
  insert into public.completed_traversals(traversal_id, run_id, batch_id, source_id, segment_id, direction, entered_at, exited_at, distance_m, accepted_at)
    values (supplied.traversal_id, supplied.run_id, supplied.batch_id, supplied.source_id, supplied.segment_id,
      supplied.direction, supplied.entered_at, supplied.exited_at, supplied.distance_m, accepted);
  return jsonb_build_object('status', 'accepted', 'traversal_id', supplied.traversal_id, 'accepted_at', accepted, 'replayed', false);
end;
$$;

-- The caller explicitly selects a run; this helper never substitutes another run or an older favorable completion.
create function public.project_completed_traversal(p_run_id uuid, p_segment_id text, p_direction text, p_read_at timestamptz)
returns jsonb language sql stable security definer
set search_path = '' set timezone = 'UTC' set lock_timeout = '5s' set statement_timeout = '15s'
as $$
  with selected as (
    select t.* from public.completed_traversals t
    where t.run_id = p_run_id and t.segment_id = p_segment_id and t.direction = p_direction
    order by t.exited_at desc, t.entered_at desc, t.accepted_at desc, t.traversal_id limit 1
  ), context as (
    select t.*, d.length_m, d.baseline_seconds, d.baseline_label, b.accepted_at batch_accepted_at, r.created_at run_created_at,
      a.id active_id, a.length_m active_length_m, a.baseline_seconds active_baseline_seconds, a.baseline_label active_baseline_label
    from selected t join public.speed_evidence_segments d on d.run_id = t.run_id and d.segment_id = t.segment_id and d.direction = t.direction
    join public.speed_evidence_batches b on b.run_id = t.run_id and b.batch_id = t.batch_id
    join public.speed_evidence_runs r on r.run_id = t.run_id
    left join public.demo_traffic_segments a on a.corridor_id = 'mangaluru-central-v1' and a.id = t.segment_id and a.direction = t.direction
  ), assessed as (
    select c.*, case
      when p_read_at is null or not isfinite(p_read_at) then 'invalid'
      when active_id is null or (active_length_m, active_baseline_seconds, active_baseline_label)
        is distinct from (length_m, baseline_seconds, baseline_label) then 'incompatible'
      when not isfinite(entered_at) or not isfinite(exited_at) or not isfinite(accepted_at)
        or entered_at >= exited_at or exited_at > accepted_at or entered_at <= accepted_at - interval '20 minutes'
        or distance_m <> length_m or baseline_seconds not between 1 and 86400 or char_length(btrim(baseline_label)) not between 1 and 200 then 'invalid'
      when entered_at > p_read_at or exited_at > p_read_at or accepted_at > p_read_at
        or batch_accepted_at > p_read_at or run_created_at > p_read_at then 'future'
      when entered_at <= p_read_at - interval '20 minutes' then 'stale'
      else 'available' end state
    from context c
  )
  select coalesce((select jsonb_build_object('segment_id', p_segment_id, 'direction', p_direction, 'state', state,
    'provenance', 'simulated', 'entered_at', entered_at, 'exited_at', exited_at, 'valid_until', entered_at + interval '20 minutes',
    'elapsed_seconds', extract(epoch from exited_at - entered_at), 'baseline_seconds', baseline_seconds, 'baseline_label', baseline_label,
    'delay_seconds', case when state = 'available' then greatest(0::numeric, extract(epoch from exited_at - entered_at) - baseline_seconds) else null end)
    from assessed), jsonb_build_object('segment_id', p_segment_id, 'direction', p_direction,
      'state', case when p_read_at is null or not isfinite(p_read_at) then 'invalid' else 'missing' end,
      'provenance', 'simulated', 'entered_at', null, 'exited_at', null, 'valid_until', null,
      'elapsed_seconds', null, 'baseline_seconds', null, 'baseline_label', null, 'delay_seconds', null))
$$;

alter function public.ingest_completed_traversal(jsonb) owner to traversal_executor;
alter function public.check_completed_traversal(uuid) owner to traversal_executor;
alter function public.read_traversal_context(uuid, uuid, text) owner to traversal_executor;
alter function public.project_completed_traversal(uuid, text, text, timestamptz) owner to traversal_reader;
revoke all on function public.ingest_completed_traversal(jsonb), public.check_completed_traversal(uuid),
  public.read_traversal_context(uuid, uuid, text), public.project_completed_traversal(uuid, text, text, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.ingest_completed_traversal(jsonb), public.check_completed_traversal(uuid),
  public.read_traversal_context(uuid, uuid, text) to service_role, postgres;
grant execute on function public.project_completed_traversal(uuid, text, text, timestamptz) to postgres;
revoke create on schema public from traversal_executor, traversal_reader;
revoke traversal_executor, traversal_reader from postgres;
