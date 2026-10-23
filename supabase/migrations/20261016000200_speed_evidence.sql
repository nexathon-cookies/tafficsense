create role speed_evidence_executor nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant speed_evidence_executor to postgres;
grant usage, create on schema public to speed_evidence_executor;

create table public.speed_evidence_runs (
  run_id uuid primary key,
  corridor_id text not null check (corridor_id = 'mangaluru-central-v1'),
  created_at timestamptz not null check (isfinite(created_at)),
  provenance text not null default 'simulated' check (provenance = 'simulated')
);
create table public.speed_evidence_segments (
  run_id uuid not null references public.speed_evidence_runs(run_id) on delete cascade,
  segment_id text not null,
  direction text not null check (direction in ('outbound', 'inbound')),
  length_m integer not null check (length_m between 1 and 100000),
  baseline_seconds integer not null check (baseline_seconds between 1 and 86400),
  baseline_label text not null check (char_length(baseline_label) between 1 and 200),
  primary key (run_id, segment_id),
  unique (run_id, segment_id, direction)
);
create table public.speed_evidence_sources (
  run_id uuid not null,
  source_id text not null,
  segment_id text not null,
  direction text not null,
  label text not null check (char_length(label) between 1 and 200),
  primary key (run_id, source_id),
  unique (run_id, source_id, segment_id, direction),
  foreign key (run_id, segment_id, direction) references public.speed_evidence_segments(run_id, segment_id, direction) on delete cascade
);
create index speed_evidence_sources_segment on public.speed_evidence_sources(run_id, segment_id, direction);
create table public.speed_evidence_batches (
  run_id uuid not null references public.speed_evidence_runs(run_id) on delete cascade,
  batch_id uuid not null,
  anchor_at timestamptz not null check (isfinite(anchor_at)),
  accepted_at timestamptz not null check (isfinite(accepted_at)),
  content_digest bytea not null check (octet_length(content_digest) = 32),
  observation_count integer not null check (observation_count between 1 and 5000),
  inserted_observation_count integer not null check (inserted_observation_count between 0 and observation_count),
  primary key (run_id, batch_id)
);
create index speed_evidence_batches_anchor on public.speed_evidence_batches(run_id, anchor_at desc);
create table public.speed_evidence_observations (
  run_id uuid not null,
  source_id text not null,
  observed_at timestamptz not null check (isfinite(observed_at)),
  segment_id text not null,
  direction text not null,
  speed_kph numeric(6,2) not null check (speed_kph between 0 and 160),
  first_batch_id uuid not null,
  primary key (run_id, source_id, observed_at),
  foreign key (run_id, source_id, segment_id, direction) references public.speed_evidence_sources(run_id, source_id, segment_id, direction) on delete cascade,
  foreign key (run_id, first_batch_id) references public.speed_evidence_batches(run_id, batch_id) on delete cascade
);
create index speed_evidence_observations_segment_time on public.speed_evidence_observations(run_id, segment_id, direction, observed_at);
create index speed_evidence_observations_first_batch on public.speed_evidence_observations(run_id, first_batch_id);
create table public.speed_evidence_batch_samples (
  run_id uuid not null,
  batch_id uuid not null,
  source_id text not null,
  observed_at timestamptz not null,
  ordinal integer not null check (ordinal between 1 and 5000),
  primary key (run_id, batch_id, source_id, observed_at),
  unique (run_id, batch_id, ordinal),
  foreign key (run_id, batch_id) references public.speed_evidence_batches(run_id, batch_id) on delete cascade,
  foreign key (run_id, source_id, observed_at) references public.speed_evidence_observations(run_id, source_id, observed_at) on delete cascade
);
create index speed_evidence_batch_samples_observation on public.speed_evidence_batch_samples(run_id, source_id, observed_at);

create function public.reject_speed_evidence_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Retained speed evidence is immutable.' using errcode = '23514';
end;
$$;
revoke all on function public.reject_speed_evidence_update() from public, anon, authenticated, service_role;

do $$
declare table_name text;
begin
  foreach table_name in array array['speed_evidence_runs', 'speed_evidence_segments', 'speed_evidence_sources',
    'speed_evidence_batches', 'speed_evidence_observations', 'speed_evidence_batch_samples'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', table_name);
    execute format('grant select on public.%I to service_role', table_name);
    execute format('grant select, insert, delete on public.%I to speed_evidence_executor', table_name);
    execute format('create policy "Executor reads" on public.%I for select to speed_evidence_executor using (true)', table_name);
    execute format('create policy "Executor inserts" on public.%I for insert to speed_evidence_executor with check (true)', table_name);
    execute format('create policy "Executor deletes" on public.%I for delete to speed_evidence_executor using (true)', table_name);
    execute format('create trigger immutable_speed_evidence before update on public.%I for each row execute function public.reject_speed_evidence_update()', table_name);
  end loop;
end;
$$;

grant select on public.demo_traffic_corridors, public.demo_traffic_segments,
  public.demo_traffic_sources, public.demo_traffic_observations to speed_evidence_executor;
create policy "Speed evidence owned corridor" on public.demo_traffic_corridors
  for select to speed_evidence_executor using (id = 'mangaluru-central-v1' and provenance = 'simulated');
create policy "Speed evidence owned segments" on public.demo_traffic_segments
  for select to speed_evidence_executor using (corridor_id = 'mangaluru-central-v1');
create policy "Speed evidence owned sources" on public.demo_traffic_sources
  for select to speed_evidence_executor using (corridor_id = 'mangaluru-central-v1');
create policy "Speed evidence owned observations" on public.demo_traffic_observations
  for select to speed_evidence_executor using (corridor_id = 'mangaluru-central-v1' and provenance = 'simulated');

create function public.check_speed_evidence(p_run_id uuid, p_batch_id uuid)
returns jsonb language plpgsql security definer
set search_path = '' set timezone = 'UTC' set lock_timeout = '5s' set statement_timeout = '15s'
as $$
declare batch public.speed_evidence_batches%rowtype;
begin
  if p_run_id is null or p_batch_id is null then return jsonb_build_object('status', 'invalid'); end if;
  select * into batch from public.speed_evidence_batches where run_id = p_run_id and batch_id = p_batch_id;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  return jsonb_build_object('status', 'accepted', 'run_id', batch.run_id, 'batch_id', batch.batch_id,
    'accepted_at', batch.accepted_at, 'observation_count', batch.observation_count,
    'inserted_observation_count', batch.inserted_observation_count, 'replayed', true);
end;
$$;

create function public.capture_speed_evidence(p_run_id uuid, p_batch_id uuid)
returns jsonb language plpgsql security definer
set search_path = '' set timezone = 'UTC' set lock_timeout = '5s' set statement_timeout = '15s'
as $$
declare
  owned_id constant text := 'mangaluru-central-v1';
  accepted timestamptz;
  anchor timestamptz;
  segments public.demo_traffic_segments[];
  sources public.demo_traffic_sources[];
  samples public.demo_traffic_observations[];
  batch public.speed_evidence_batches%rowtype;
  existing_batch boolean;
  existing_run boolean;
  digest bytea;
  inserted_count integer;
  acknowledgement jsonb;
begin
  if p_run_id is null or p_batch_id is null then return jsonb_build_object('status', 'invalid'); end if;
  perform pg_advisory_xact_lock(72861, 3);
  accepted := clock_timestamp();
  select * into batch from public.speed_evidence_batches where run_id = p_run_id and batch_id = p_batch_id;
  existing_batch := found;

  -- One bounded statement snapshot also prevents mixed generations from direct fixture writes.
  select (select c.anchor_at from public.demo_traffic_corridors c where c.id = owned_id),
    array(select s from public.demo_traffic_segments s where s.corridor_id = owned_id order by s.id collate "C" limit 51),
    array(select s from public.demo_traffic_sources s where s.corridor_id = owned_id order by s.id collate "C" limit 501),
    array(select o from public.demo_traffic_observations o where o.corridor_id = owned_id
      order by o.source_id collate "C", o.observed_at limit 5001)
    into anchor, segments, sources, samples;
  if anchor is null or cardinality(segments) = 0 or cardinality(sources) = 0 or cardinality(samples) = 0 then
    return jsonb_build_object('status', case when existing_batch then 'conflict' else 'unavailable' end);
  end if;
  if cardinality(segments) > 50 or cardinality(sources) > 500 or cardinality(samples) > 5000 then
    return jsonb_build_object('status', case when existing_batch then 'conflict' else 'limit_reached' end);
  end if;

  -- JSON is only canonical digest material; inserts retain the persisted typed values.
  digest := sha256(convert_to(jsonb_build_array('speed-evidence-v1', owned_id, anchor,
    (select jsonb_agg(jsonb_build_array(s.id, s.direction, s.length_m, s.baseline_seconds, s.baseline_label) order by s.id collate "C") from unnest(segments) s),
    (select jsonb_agg(jsonb_build_array(s.id, s.segment_id, s.label) order by s.id collate "C") from unnest(sources) s),
    (select jsonb_agg(jsonb_build_array(o.source_id, o.observed_at, o.segment_id, o.speed_kph) order by o.source_id collate "C", o.observed_at) from unnest(samples) o)
  )::text, 'UTF8'));
  if existing_batch then
    if batch.content_digest <> digest then return jsonb_build_object('status', 'conflict'); end if;
    return public.check_speed_evidence(p_run_id, p_batch_id);
  end if;

  select exists(select 1 from public.speed_evidence_runs where run_id = p_run_id) into existing_run;
  if existing_run then
    if (select count(*) from public.speed_evidence_segments where run_id = p_run_id) <> cardinality(segments)
      or (select count(*) from public.speed_evidence_sources where run_id = p_run_id) <> cardinality(sources)
      or exists (select 1 from unnest(segments) s left join public.speed_evidence_segments e
        on e.run_id = p_run_id and e.segment_id = s.id
        where e.segment_id is null or (e.direction, e.length_m, e.baseline_seconds, e.baseline_label)
          is distinct from (s.direction, s.length_m, s.baseline_seconds, s.baseline_label))
      or exists (select 1 from unnest(sources) s left join public.speed_evidence_sources e
        on e.run_id = p_run_id and e.source_id = s.id
        where e.source_id is null or (e.segment_id, e.label) is distinct from (s.segment_id, s.label))
      or exists (select 1 from unnest(samples) o join public.speed_evidence_observations e
        on e.run_id = p_run_id and e.source_id = o.source_id and e.observed_at = o.observed_at
        where (e.segment_id, e.speed_kph) is distinct from (o.segment_id, o.speed_kph))
      or anchor < (select max(anchor_at) from public.speed_evidence_batches where run_id = p_run_id) then
      return jsonb_build_object('status', 'conflict');
    end if;
  end if;
  if exists (select 1 from unnest(samples) o where o.observed_at <= accepted - interval '20 minutes' or o.observed_at > accepted) then
    return jsonb_build_object('status', 'invalid');
  end if;
  select count(*) into inserted_count from unnest(samples) o where not exists (
    select 1 from public.speed_evidence_observations e where e.run_id = p_run_id and e.source_id = o.source_id and e.observed_at = o.observed_at
  );
  if (not existing_run and (select count(*) from public.speed_evidence_runs) >= 100)
    or (select count(*) from public.speed_evidence_batches) >= 2000
    or (select count(*) from public.speed_evidence_observations) + inserted_count > 100000
    or (select count(*) from public.speed_evidence_batch_samples) + cardinality(samples) > 250000 then
    return jsonb_build_object('status', 'limit_reached');
  end if;

  if not existing_run then
    insert into public.speed_evidence_runs(run_id, corridor_id, created_at) values (p_run_id, owned_id, accepted);
    insert into public.speed_evidence_segments(run_id, segment_id, direction, length_m, baseline_seconds, baseline_label)
      select p_run_id, s.id, s.direction, s.length_m, s.baseline_seconds, s.baseline_label from unnest(segments) s;
    insert into public.speed_evidence_sources(run_id, source_id, segment_id, direction, label)
      select p_run_id, s.id, s.segment_id, d.direction, s.label from unnest(sources) s join unnest(segments) d on d.id = s.segment_id;
  end if;
  insert into public.speed_evidence_batches(run_id, batch_id, anchor_at, accepted_at, content_digest, observation_count, inserted_observation_count)
    values (p_run_id, p_batch_id, anchor, accepted, digest, cardinality(samples), inserted_count);
  insert into public.speed_evidence_observations(run_id, source_id, observed_at, segment_id, direction, speed_kph, first_batch_id)
    select p_run_id, o.source_id, o.observed_at, o.segment_id, d.direction, o.speed_kph, p_batch_id
    from unnest(samples) o join unnest(segments) d on d.id = o.segment_id
    where not exists (select 1 from public.speed_evidence_observations e
      where e.run_id = p_run_id and e.source_id = o.source_id and e.observed_at = o.observed_at);
  insert into public.speed_evidence_batch_samples(run_id, batch_id, source_id, observed_at, ordinal)
    select p_run_id, p_batch_id, o.source_id, o.observed_at,
      row_number() over (order by o.source_id collate "C", o.observed_at)::integer from unnest(samples) o;
  acknowledgement := public.check_speed_evidence(p_run_id, p_batch_id);
  return acknowledgement || jsonb_build_object('replayed', false);
end;
$$;

create function public.cleanup_speed_evidence(p_run_id uuid)
returns jsonb language plpgsql security definer
set search_path = '' set timezone = 'UTC' set lock_timeout = '5s' set statement_timeout = '15s'
as $$
declare removed integer;
begin
  if p_run_id is null then return jsonb_build_object('status', 'invalid'); end if;
  perform pg_advisory_xact_lock(72861, 3);
  delete from public.speed_evidence_runs where run_id = p_run_id;
  get diagnostics removed = row_count;
  return jsonb_build_object('status', 'ready', 'removed', removed > 0);
end;
$$;

alter function public.capture_speed_evidence(uuid, uuid) owner to speed_evidence_executor;
alter function public.check_speed_evidence(uuid, uuid) owner to speed_evidence_executor;
alter function public.cleanup_speed_evidence(uuid) owner to speed_evidence_executor;
revoke all on function public.capture_speed_evidence(uuid, uuid), public.check_speed_evidence(uuid, uuid),
  public.cleanup_speed_evidence(uuid) from public, anon, authenticated, service_role;
grant execute on function public.capture_speed_evidence(uuid, uuid), public.check_speed_evidence(uuid, uuid),
  public.cleanup_speed_evidence(uuid) to service_role, postgres;
revoke create on schema public from speed_evidence_executor;
revoke speed_evidence_executor from postgres;
