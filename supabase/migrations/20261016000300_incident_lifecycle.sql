select pg_advisory_xact_lock(72861, 3);
create role incident_lifecycle_executor nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create role incident_lifecycle_reader nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant incident_lifecycle_executor, incident_lifecycle_reader to postgres;
grant usage, create on schema public to incident_lifecycle_executor, incident_lifecycle_reader;

create table public.incident_lifecycle_cycles (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  segment_id text not null,
  direction text not null,
  prior_cycle_id uuid,
  started_at timestamptz not null check (isfinite(started_at)),
  created_at timestamptz not null check (isfinite(created_at)),
  unique (id, run_id),
  unique (id, run_id, segment_id, direction),
  foreign key (run_id, segment_id, direction) references public.speed_evidence_segments(run_id, segment_id, direction) on delete cascade,
  foreign key (prior_cycle_id, run_id, segment_id, direction) references public.incident_lifecycle_cycles(id, run_id, segment_id, direction) on delete cascade,
  check (prior_cycle_id is distinct from id)
);
create index incident_lifecycle_cycles_direction on public.incident_lifecycle_cycles(run_id, segment_id, direction, started_at);
create unique index incident_lifecycle_cycles_successor on public.incident_lifecycle_cycles(prior_cycle_id) where prior_cycle_id is not null;
create table public.incident_lifecycle_events (
  event_id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null,
  run_id uuid not null,
  batch_id uuid not null,
  kind text not null check (kind in ('supported', 'withdrawn', 'cleared')),
  terminal_at timestamptz not null check (isfinite(terminal_at)),
  accepted_at timestamptz not null check (isfinite(accepted_at) and terminal_at <= accepted_at),
  proof_start timestamptz not null check (isfinite(proof_start) and proof_start <= terminal_at),
  valid_until timestamptz check (isfinite(valid_until)),
  complete_source_count integer not null check (complete_source_count between 0 and 500),
  slow_source_count integer not null check (slow_source_count between 0 and 500),
  recovered_source_count integer not null check (recovered_source_count between 0 and 500),
  continuous_source_count integer not null check (continuous_source_count between 0 and 500),
  conflicting_source_count integer not null check (conflicting_source_count between 0 and 500),
  unique (event_id, run_id),
  unique (cycle_id, terminal_at),
  foreign key (cycle_id, run_id) references public.incident_lifecycle_cycles(id, run_id) on delete cascade,
  foreign key (run_id, batch_id) references public.speed_evidence_batches(run_id, batch_id) on delete cascade,
  check (kind <> 'supported' or (complete_source_count >= 3 and slow_source_count >= 3 and valid_until is not null)),
  check (kind <> 'cleared' or (continuous_source_count >= 3 and conflicting_source_count < 3))
);
create index incident_lifecycle_events_latest on public.incident_lifecycle_events(cycle_id, terminal_at desc);
create index incident_lifecycle_events_batch on public.incident_lifecycle_events(run_id, batch_id);
create table public.incident_lifecycle_event_samples (
  event_id uuid not null,
  run_id uuid not null,
  source_id text not null,
  observed_at timestamptz not null,
  primary key (event_id, run_id, source_id, observed_at),
  foreign key (event_id, run_id) references public.incident_lifecycle_events(event_id, run_id) on delete cascade,
  foreign key (run_id, source_id, observed_at) references public.speed_evidence_observations(run_id, source_id, observed_at) on delete cascade
);
create index incident_lifecycle_event_samples_observation on public.incident_lifecycle_event_samples(run_id, source_id, observed_at);
-- Episode IDs and interval snapshots survive report cleanup; they are not report membership.
create table public.incident_lifecycle_episode_links (
  event_id uuid not null references public.incident_lifecycle_events(event_id) on delete cascade,
  episode_id uuid not null,
  assignment_lower timestamptz,
  assignment_upper timestamptz not null check (isfinite(assignment_upper)),
  primary key (event_id, episode_id)
);
create table public.incident_lifecycle_cursors (
  run_id uuid not null,
  segment_id text not null,
  direction text not null,
  terminal_at timestamptz not null check (isfinite(terminal_at)),
  cycle_id uuid,
  primary key (run_id, segment_id, direction),
  foreign key (run_id, segment_id, direction) references public.speed_evidence_segments(run_id, segment_id, direction) on delete cascade,
  foreign key (cycle_id, run_id, segment_id, direction) references public.incident_lifecycle_cycles(id, run_id, segment_id, direction) on delete cascade
);

do $$
declare table_name text;
begin
  foreach table_name in array array['cycles','events','event_samples','episode_links','cursors'] loop
    table_name := 'incident_lifecycle_' || table_name;
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', table_name);
    execute format('grant select on public.%I to service_role', table_name);
    if table_name in ('incident_lifecycle_cycles', 'incident_lifecycle_events', 'incident_lifecycle_episode_links') then
      execute format('grant select on public.%I to incident_lifecycle_reader', table_name);
    end if;
    execute format('grant select, insert on public.%I to incident_lifecycle_executor', table_name);
    execute format('create policy "Lifecycle reads" on public.%I for select to incident_lifecycle_executor, incident_lifecycle_reader using (true)', table_name);
    execute format('create policy "Lifecycle inserts" on public.%I for insert to incident_lifecycle_executor with check (true)', table_name);
    if table_name <> 'incident_lifecycle_cursors' then
      execute format('create trigger immutable_incident_lifecycle before update on public.%I for each row execute function public.reject_speed_evidence_update()', table_name);
    end if;
  end loop;
end;
$$;
grant update (terminal_at, cycle_id) on public.incident_lifecycle_cursors to incident_lifecycle_executor;
create policy "Lifecycle advances cursor" on public.incident_lifecycle_cursors for update to incident_lifecycle_executor using (true) with check (true);

grant select on public.speed_evidence_runs, public.speed_evidence_segments, public.speed_evidence_sources,
  public.speed_evidence_batches, public.speed_evidence_observations, public.speed_evidence_batch_samples to incident_lifecycle_executor;
grant select on public.speed_evidence_segments, public.speed_evidence_batches to incident_lifecycle_reader;
do $$
declare table_name text;
begin
  foreach table_name in array array['runs','segments','sources','batches','observations','batch_samples'] loop
    execute format('create policy "Lifecycle reads retained evidence" on public.speed_evidence_%I for select to incident_lifecycle_executor using (true)', table_name);
  end loop;
end;
$$;
create policy "Lifecycle projection reads segments" on public.speed_evidence_segments for select to incident_lifecycle_reader using (true);
create policy "Lifecycle projection reads batches" on public.speed_evidence_batches for select to incident_lifecycle_reader using (true);
grant select (id, segment_id, direction, assignment_lower, assignment_upper, observed_high_water) on public.incident_episodes to incident_lifecycle_executor;
create policy "Lifecycle reads episode intervals" on public.incident_episodes for select to incident_lifecycle_executor using (true);
grant select on public.demo_traffic_segments to incident_lifecycle_reader;
create policy "Lifecycle projection reads fixture" on public.demo_traffic_segments for select to incident_lifecycle_reader using (corridor_id = 'mangaluru-central-v1');
grant select (episode_id) on public.public_traffic_reports to incident_lifecycle_reader;
create policy "Lifecycle projection reads public associations" on public.public_traffic_reports for select to incident_lifecycle_reader using (true);

create function public.incident_lifecycle_timestamp(p_time timestamptz)
returns text language sql immutable strict set search_path = '' as $$
  select to_char(p_time at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
$$;
revoke all on function public.incident_lifecycle_timestamp(timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.incident_lifecycle_timestamp(timestamptz) to incident_lifecycle_executor, incident_lifecycle_reader, postgres;

-- SQL parity is tested against assessSlowdown and assessRecovery, including numeric cross-products.
create function public.evaluate_incident_lifecycle(p_run_id uuid, p_segment_id text, p_direction text, p_read_at timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' set timezone = 'UTC'
as $$
declare
  segment public.speed_evidence_segments%rowtype;
  terminal timestamptz;
  next_future timestamptz;
  slow_start timestamptz;
  prior_start timestamptz;
  slow_deadline timestamptz;
  recovery_deadline timestamptz;
  slow_status text := 'unavailable';
  recovery_status text := 'unavailable';
  slow_complete integer := 0;
  slow_count integer := 0;
  recovery_complete integer := 0;
  prior_count integer := 0;
  recovered_count integer := 0;
  continuous_count integer := 0;
  conflict_count integer := 0;
begin
  select * into segment from public.speed_evidence_segments
    where run_id = p_run_id and segment_id = p_segment_id and direction = p_direction;
  if found and p_read_at is not null and isfinite(p_read_at) and btrim(segment.baseline_label) <> '' then
    select max(o.observed_at) filter (where o.observed_at <= p_read_at), min(o.observed_at) filter (where o.observed_at > p_read_at)
      into terminal, next_future
      from public.speed_evidence_observations o join public.speed_evidence_batches b
        on b.run_id = o.run_id and b.batch_id = o.first_batch_id
      where o.run_id = p_run_id and o.segment_id = p_segment_id and o.direction = p_direction and b.accepted_at <= p_read_at;
    slow_deadline := date_trunc('milliseconds', next_future);
    recovery_deadline := slow_deadline;
    if terminal is null then
      slow_status := case when next_future is null then 'missing' else 'future' end;
      recovery_status := slow_status;
    else
      slow_start := terminal - interval '5 minutes';
      prior_start := terminal - interval '11 minutes';
      if slow_start <= p_read_at - interval '20 minutes' then
        slow_status := 'stale';
      else
        slow_deadline := date_trunc('milliseconds', least(slow_start + interval '20 minutes', next_future));
        select count(*) filter (where ticks = 6 and regular), count(*) filter (where ticks = 6 and regular and slow)
          into slow_complete, slow_count from (
            select o.source_id, count(*) as ticks,
              bool_and(mod(extract(epoch from (o.observed_at - slow_start)), 60) = 0) as regular,
              bool_and(o.speed_kph * segment.baseline_seconds * 25 < segment.length_m::numeric * 36) as slow
            from public.speed_evidence_observations o join public.speed_evidence_batches b
              on b.run_id = o.run_id and b.batch_id = o.first_batch_id
            where o.run_id = p_run_id and o.segment_id = p_segment_id and o.direction = p_direction
              and b.accepted_at <= p_read_at and o.observed_at between slow_start and terminal group by o.source_id
          ) cohort;
        slow_status := case when slow_complete < 3 then 'insufficient' when slow_count >= 3 then 'supported' else 'not_supported' end;
      end if;
      if prior_start <= p_read_at - interval '20 minutes' then
        recovery_status := 'stale';
      else
        recovery_deadline := date_trunc('milliseconds', least(prior_start + interval '20 minutes', next_future));
        select count(*) filter (where ticks = 12 and regular),
          count(*) filter (where ticks = 12 and regular and prior_slow),
          count(*) filter (where ticks = 12 and regular and recovered),
          count(*) filter (where ticks = 12 and regular and prior_slow and recovered)
          into recovery_complete, prior_count, recovered_count, continuous_count from (
            select o.source_id, count(*) as ticks,
              bool_and(mod(extract(epoch from (o.observed_at - prior_start)), 60) = 0) as regular,
              bool_and(o.speed_kph * segment.baseline_seconds * 25 < segment.length_m::numeric * 36) filter (where o.observed_at < slow_start) as prior_slow,
              bool_and(o.speed_kph * segment.baseline_seconds * 25 > segment.length_m::numeric * 63) filter (where o.observed_at >= slow_start) as recovered
            from public.speed_evidence_observations o join public.speed_evidence_batches b
              on b.run_id = o.run_id and b.batch_id = o.first_batch_id
            where o.run_id = p_run_id and o.segment_id = p_segment_id and o.direction = p_direction
              and b.accepted_at <= p_read_at and o.observed_at between prior_start and terminal group by o.source_id
          ) cohort;
        conflict_count := slow_count;
        recovery_status := case when recovery_complete < 3 then 'insufficient' when prior_count < 3 then 'no_prior_slowdown'
          when conflict_count >= 3 then 'conflicting' when recovered_count < 3 then 'threshold_not_met'
          when continuous_count < 3 then 'cohort_mismatch' else 'supported' end;
      end if;
    end if;
  end if;
  return jsonb_build_object('slowdown', jsonb_build_object(
    'segment_id', p_segment_id, 'direction', p_direction, 'status', slow_status,
    'window_start', public.incident_lifecycle_timestamp(slow_start), 'window_end', public.incident_lifecycle_timestamp(terminal),
    'complete_source_count', slow_complete, 'slow_source_count', slow_count,
    'valid_until', public.incident_lifecycle_timestamp(slow_deadline), 'provenance', 'simulated'),
    'recovery', jsonb_build_object('segment_id', p_segment_id, 'direction', p_direction, 'status', recovery_status,
    'slowdown_start', public.incident_lifecycle_timestamp(prior_start), 'slowdown_end', public.incident_lifecycle_timestamp(terminal - interval '6 minutes'),
    'recovery_start', public.incident_lifecycle_timestamp(slow_start), 'recovery_end', public.incident_lifecycle_timestamp(terminal),
    'complete_source_count', recovery_complete, 'prior_slow_source_count', prior_count, 'recovered_source_count', recovered_count,
    'continuous_source_count', continuous_count, 'conflicting_source_count', conflict_count,
    'valid_until', public.incident_lifecycle_timestamp(recovery_deadline), 'provenance', 'simulated'));
end;
$$;

create function public.associate_incident_lifecycle(p_event_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare allocations integer;
begin
  perform pg_advisory_xact_lock(72861, 3);
  select count(*) into allocations from public.incident_lifecycle_events e
    join public.incident_lifecycle_cycles c on c.id = e.cycle_id
    join public.incident_episodes episode on episode.segment_id = c.segment_id and episode.direction = c.direction
    where e.event_id = p_event_id and e.kind <> 'withdrawn'
      and (episode.assignment_lower is null or e.proof_start >= episode.assignment_lower)
      and e.terminal_at < coalesce(episode.assignment_upper, episode.observed_high_water + interval '20 minutes')
      and not exists(select 1 from public.incident_lifecycle_episode_links l where l.event_id = e.event_id and l.episode_id = episode.id);
  if (select count(*) from public.incident_lifecycle_episode_links) + allocations > 10000 then
    raise exception 'Incident lifecycle retention limit reached' using errcode = '54000';
  end if;
  insert into public.incident_lifecycle_episode_links(event_id, episode_id, assignment_lower, assignment_upper)
    select e.event_id, episode.id, episode.assignment_lower, coalesce(episode.assignment_upper, episode.observed_high_water + interval '20 minutes')
    from public.incident_lifecycle_events e join public.incident_lifecycle_cycles c on c.id = e.cycle_id
    join public.incident_episodes episode on episode.segment_id = c.segment_id and episode.direction = c.direction
    where e.event_id = p_event_id and e.kind <> 'withdrawn'
      and (episode.assignment_lower is null or e.proof_start >= episode.assignment_lower)
      and e.terminal_at < coalesce(episode.assignment_upper, episode.observed_high_water + interval '20 minutes')
    on conflict do nothing;
end;
$$;

create function public.append_incident_lifecycle_event(p_cycle_id uuid, p_batch_id uuid, p_kind text,
  p_terminal timestamptz, p_start timestamptz, p_proof jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  cycle public.incident_lifecycle_cycles%rowtype;
  accepted timestamptz;
  event uuid;
  sample_count integer;
  complete_count integer;
  slow_count integer;
begin
  perform pg_advisory_xact_lock(72861, 3);
  select * into strict cycle from public.incident_lifecycle_cycles where id = p_cycle_id;
  select accepted_at into strict accepted from public.speed_evidence_batches where run_id = cycle.run_id and batch_id = p_batch_id;
  select count(*) into sample_count from public.speed_evidence_observations o join public.speed_evidence_batches b
    on b.run_id = o.run_id and b.batch_id = o.first_batch_id
    where o.run_id = cycle.run_id and o.segment_id = cycle.segment_id and o.direction = cycle.direction
      and o.observed_at between p_start and p_terminal and b.accepted_at <= accepted;
  if (select count(*) from public.incident_lifecycle_events) >= 10000
    or (select count(*) from public.incident_lifecycle_event_samples) + sample_count > 500000 then
    raise exception 'Incident lifecycle retention limit reached' using errcode = '54000';
  end if;
  complete_count := (p_proof->>'complete_source_count')::integer;
  slow_count := coalesce((p_proof->>'slow_source_count')::integer, (p_proof->>'prior_slow_source_count')::integer, 0);
  if p_kind = 'supported' then
    -- Historical support counts include the whole six-tick cohort, not only later recoverers.
    select count(*) filter (where ticks = 6 and regular), count(*) filter (where ticks = 6 and regular and slow)
      into complete_count, slow_count from (
        select o.source_id, count(*) as ticks,
          bool_and(mod(extract(epoch from (o.observed_at - p_start)), 60) = 0) as regular,
          bool_and(o.speed_kph * s.baseline_seconds * 25 < s.length_m::numeric * 36) as slow
        from public.speed_evidence_observations o join public.speed_evidence_batches b
          on b.run_id = o.run_id and b.batch_id = o.first_batch_id
        join public.speed_evidence_segments s on s.run_id = o.run_id and s.segment_id = o.segment_id and s.direction = o.direction
        where o.run_id = cycle.run_id and o.segment_id = cycle.segment_id and o.direction = cycle.direction
          and b.accepted_at <= accepted and o.observed_at between p_start and p_terminal group by o.source_id
      ) cohort;
  end if;
  insert into public.incident_lifecycle_events(cycle_id, run_id, batch_id, kind, terminal_at, accepted_at, proof_start,
    valid_until, complete_source_count, slow_source_count, recovered_source_count, continuous_source_count, conflicting_source_count)
    values (cycle.id, cycle.run_id, p_batch_id, p_kind, p_terminal, accepted, p_start,
      (p_proof->>'valid_until')::timestamptz, complete_count, slow_count,
      case when p_kind = 'cleared' then (p_proof->>'recovered_source_count')::integer else 0 end,
      case when p_kind = 'cleared' then (p_proof->>'continuous_source_count')::integer else 0 end,
      case when p_kind = 'cleared' then (p_proof->>'conflicting_source_count')::integer else 0 end) returning event_id into event;
  insert into public.incident_lifecycle_event_samples(event_id, run_id, source_id, observed_at)
    select event, o.run_id, o.source_id, o.observed_at from public.speed_evidence_observations o
    join public.speed_evidence_batches b on b.run_id = o.run_id and b.batch_id = o.first_batch_id
    where o.run_id = cycle.run_id and o.segment_id = cycle.segment_id and o.direction = cycle.direction
      and o.observed_at between p_start and p_terminal and b.accepted_at <= accepted;
  perform public.associate_incident_lifecycle(event);
end;
$$;

create function public.process_incident_lifecycle(p_run_id uuid, p_batch_id uuid)
returns void language plpgsql security definer set search_path = '' set timezone = 'UTC' set lock_timeout = '5s'
as $$
declare
  batch public.speed_evidence_batches%rowtype;
  segment record;
  cursor_row public.incident_lifecycle_cursors%rowtype;
  latest public.incident_lifecycle_events%rowtype;
  last_support public.incident_lifecycle_events%rowtype;
  assessment jsonb;
  slow jsonb;
  recovery jsonb;
  p_terminal timestamptz;
  proof_start timestamptz;
  previous uuid;
  cycle uuid;
  qualifies_recovery boolean;
begin
  perform pg_advisory_xact_lock(72861, 3);
  select * into strict batch from public.speed_evidence_batches where run_id = p_run_id and batch_id = p_batch_id;
  if (select count(*) from public.speed_evidence_batch_samples where run_id = p_run_id and batch_id = p_batch_id) <> batch.observation_count then
    raise exception 'Incident lifecycle requires complete accepted batch membership' using errcode = '23514';
  end if;
  for segment in select segment_id, direction from public.speed_evidence_segments where run_id = p_run_id order by segment_id, direction loop
    assessment := public.evaluate_incident_lifecycle(p_run_id, segment.segment_id, segment.direction, batch.accepted_at);
    slow := assessment->'slowdown';
    recovery := assessment->'recovery';
    p_terminal := (slow->>'window_end')::timestamptz;
    if p_terminal is null then continue; end if;
    select * into cursor_row from public.incident_lifecycle_cursors
      where run_id = p_run_id and segment_id = segment.segment_id and direction = segment.direction;
    if found and p_terminal <= cursor_row.terminal_at then continue; end if;
    if cursor_row.run_id is null then
      if (select count(*) from public.incident_lifecycle_cursors) >= 5000 then
        raise exception 'Incident lifecycle retention limit reached' using errcode = '54000';
      end if;
      insert into public.incident_lifecycle_cursors(run_id, segment_id, direction, terminal_at)
        values(p_run_id, segment.segment_id, segment.direction, p_terminal);
    end if;
    cycle := cursor_row.cycle_id;
    select * into latest from public.incident_lifecycle_events where cycle_id = cycle order by terminal_at desc limit 1;
    select * into last_support from public.incident_lifecycle_events where cycle_id = cycle and kind = 'supported' order by terminal_at desc limit 1;
    qualifies_recovery := recovery->>'status' = 'supported'
      and (last_support.event_id is null or (recovery->>'slowdown_end')::timestamptz >= last_support.terminal_at);
    if cycle is null or latest.kind = 'cleared' then
      qualifies_recovery := qualifies_recovery and (cursor_row.terminal_at is null
        or (recovery->>'slowdown_end')::timestamptz > cursor_row.terminal_at);
      previous := cycle;
      proof_start := case when qualifies_recovery then (recovery->>'slowdown_start')::timestamptz else (slow->>'window_start')::timestamptz end;
      if (slow->>'status' = 'supported' or qualifies_recovery)
        and (latest.kind is distinct from 'cleared' or proof_start > latest.terminal_at) then
        if (select count(*) from public.incident_lifecycle_cycles) >= 2000 then
          raise exception 'Incident lifecycle retention limit reached' using errcode = '54000';
        end if;
        insert into public.incident_lifecycle_cycles(run_id, segment_id, direction, prior_cycle_id, started_at, created_at)
          values(p_run_id, segment.segment_id, segment.direction, previous, proof_start, batch.accepted_at) returning id into cycle;
        if qualifies_recovery then
          perform public.append_incident_lifecycle_event(cycle, p_batch_id, 'supported', (recovery->>'slowdown_end')::timestamptz, proof_start,
            recovery || jsonb_build_object('valid_until', public.incident_lifecycle_timestamp(date_trunc('milliseconds', proof_start + interval '20 minutes'))));
          perform public.append_incident_lifecycle_event(cycle, p_batch_id, 'cleared', p_terminal, proof_start, recovery);
        else
          perform public.append_incident_lifecycle_event(cycle, p_batch_id, 'supported', p_terminal, proof_start, slow);
        end if;
      end if;
    elsif qualifies_recovery then
      perform public.append_incident_lifecycle_event(cycle, p_batch_id, 'cleared', p_terminal, (recovery->>'slowdown_start')::timestamptz, recovery);
    elsif slow->>'status' = 'supported' then
      perform public.append_incident_lifecycle_event(cycle, p_batch_id, 'supported', p_terminal, (slow->>'window_start')::timestamptz, slow);
    elsif latest.kind = 'supported' then
      perform public.append_incident_lifecycle_event(cycle, p_batch_id, 'withdrawn', p_terminal, (slow->>'window_start')::timestamptz, slow);
    end if;
    update public.incident_lifecycle_cursors set terminal_at = p_terminal, cycle_id = cycle
      where run_id = p_run_id and segment_id = segment.segment_id and direction = segment.direction;
  end loop;
end;
$$;

create function public.capture_incident_lifecycle()
returns trigger language plpgsql security definer set search_path = '' as $$
declare batch record;
begin
  for batch in select distinct run_id, batch_id from accepted_samples order by run_id, batch_id loop
    perform public.process_incident_lifecycle(batch.run_id, batch.batch_id);
  end loop;
  return null;
end;
$$;
create trigger capture_incident_lifecycle after insert on public.speed_evidence_batch_samples
  referencing new table as accepted_samples for each statement execute function public.capture_incident_lifecycle();

create function public.link_incident_lifecycle_episode()
returns trigger language plpgsql security definer set search_path = '' as $$
declare allocations integer;
begin
  perform pg_advisory_xact_lock(72861, 3);
  select count(*) into allocations from public.incident_lifecycle_events e join public.incident_lifecycle_cycles c on c.id = e.cycle_id
    where c.segment_id = new.segment_id and c.direction = new.direction and e.kind <> 'withdrawn'
      and (new.assignment_lower is null or e.proof_start >= new.assignment_lower)
      and e.terminal_at < coalesce(new.assignment_upper, new.observed_high_water + interval '20 minutes')
      and not exists(select 1 from public.incident_lifecycle_episode_links l where l.event_id = e.event_id and l.episode_id = new.id);
  if (select count(*) from public.incident_lifecycle_episode_links) + allocations > 10000 then
    raise exception 'Incident lifecycle retention limit reached' using errcode = '54000';
  end if;
  insert into public.incident_lifecycle_episode_links(event_id, episode_id, assignment_lower, assignment_upper)
    select e.event_id, new.id, new.assignment_lower, coalesce(new.assignment_upper, new.observed_high_water + interval '20 minutes')
    from public.incident_lifecycle_events e join public.incident_lifecycle_cycles c on c.id = e.cycle_id
    where c.segment_id = new.segment_id and c.direction = new.direction and e.kind <> 'withdrawn'
      and (new.assignment_lower is null or e.proof_start >= new.assignment_lower)
      and e.terminal_at < coalesce(new.assignment_upper, new.observed_high_water + interval '20 minutes')
    on conflict do nothing;
  return null;
end;
$$;
create trigger link_incident_lifecycle_episode after insert or update on public.incident_episodes
  for each row execute function public.link_incident_lifecycle_episode();

-- Only the enclosing public snapshot may supply its statement clock. Reads never repair state.
create function public.project_incident_lifecycle(p_read_at timestamptz)
returns jsonb language sql stable security definer set search_path = '' set timezone = 'UTC' as $$
  with visible as (
    select c.*, latest.kind, latest.terminal_at, latest.accepted_at,
      case when latest.kind = 'withdrawn' then support.event_id else latest.event_id end as association_event_id,
      support.terminal_at as support_end, support.proof_start as support_start, support.valid_until as support_deadline,
      support.complete_source_count, support.slow_source_count,
      latest.proof_start as clearance_start, latest.continuous_source_count,
      selected.run_id = c.run_id and selected.length_m = fixture.length_m
        and selected.baseline_seconds = fixture.baseline_seconds and selected.baseline_label = fixture.baseline_label as current_context
    from public.incident_lifecycle_cycles c
    join public.demo_traffic_segments fixture on fixture.id = c.segment_id and fixture.direction = c.direction and fixture.corridor_id = 'mangaluru-central-v1'
    cross join lateral (select e.* from public.incident_lifecycle_events e where e.cycle_id = c.id and e.accepted_at <= p_read_at order by e.terminal_at desc limit 1) latest
    cross join lateral (select e.* from public.incident_lifecycle_events e where e.cycle_id = c.id and e.kind = 'supported' and e.accepted_at <= p_read_at order by e.terminal_at desc limit 1) support
    cross join lateral (
      select s.run_id, s.length_m, s.baseline_seconds, s.baseline_label from public.speed_evidence_segments s
      join public.speed_evidence_batches b on b.run_id = s.run_id
      where s.segment_id = c.segment_id and s.direction = c.direction and b.accepted_at <= p_read_at
      order by b.accepted_at desc, b.batch_id desc, b.run_id desc limit 1
    ) selected
    where isfinite(p_read_at) and c.created_at <= p_read_at
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', v.id, 'segment_id', v.segment_id, 'direction', v.direction,
    'episode_ids', (select coalesce(jsonb_agg(l.episode_id order by l.episode_id), '[]'::jsonb)
      from public.incident_lifecycle_episode_links l where l.event_id = v.association_event_id
        and exists(select 1 from public.public_traffic_reports r where r.episode_id = l.episode_id)),
    'started_at', public.incident_lifecycle_timestamp(v.started_at),
    'latest_support_start', public.incident_lifecycle_timestamp(v.support_start),
    'latest_support_at', public.incident_lifecycle_timestamp(v.support_end),
    'recovery_start', public.incident_lifecycle_timestamp(case when v.kind = 'cleared' then v.terminal_at - interval '5 minutes' end),
    'recovery_end', public.incident_lifecycle_timestamp(case when v.kind = 'cleared' then v.terminal_at end),
    'cleared_at', public.incident_lifecycle_timestamp(case when v.kind = 'cleared' then v.accepted_at end),
    'last_transition_at', public.incident_lifecycle_timestamp(v.accepted_at),
    'state', case when v.kind = 'cleared' then 'cleared' when not v.current_context then 'historical'
      when p_read_at >= v.support_deadline then 'stale' when v.kind = 'withdrawn' then 'unconfirmed' else 'supported' end,
    'current_context', v.current_context, 'prior_cycle_id', v.prior_cycle_id,
    'complete_source_count', v.complete_source_count, 'slow_source_count', v.slow_source_count,
    'recovery_source_count', case when v.kind = 'cleared' then v.continuous_source_count else 0 end,
    'valid_until', public.incident_lifecycle_timestamp(case when v.kind <> 'cleared' then v.support_deadline end),
    'provenance', 'simulated', 'cause', 'unknown'
  ) order by v.started_at, v.id), '[]'::jsonb) from visible v;
$$;

do $$
declare signature text;
begin
  foreach signature in array array['evaluate_incident_lifecycle(uuid,text,text,timestamptz)', 'associate_incident_lifecycle(uuid)',
    'append_incident_lifecycle_event(uuid,uuid,text,timestamptz,timestamptz,jsonb)', 'process_incident_lifecycle(uuid,uuid)',
    'capture_incident_lifecycle()', 'link_incident_lifecycle_episode()'] loop
    execute format('alter function public.%s owner to incident_lifecycle_executor', signature);
    execute format('revoke all on function public.%s from public, anon, authenticated, service_role', signature);
    execute format('grant execute on function public.%s to postgres', signature);
  end loop;
end;
$$;
alter function public.project_incident_lifecycle(timestamptz) owner to incident_lifecycle_reader;
revoke all on function public.project_incident_lifecycle(timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.project_incident_lifecycle(timestamptz) to postgres;

-- Replay retained acceptance order under the same lock; cleanup cascades are not clearance events.
do $$
declare batch record;
begin
  for batch in select run_id, batch_id from public.speed_evidence_batches order by accepted_at, batch_id, run_id loop
    perform public.process_incident_lifecycle(batch.run_id, batch.batch_id);
  end loop;
end;
$$;
revoke create on schema public from incident_lifecycle_executor, incident_lifecycle_reader;
revoke incident_lifecycle_executor, incident_lifecycle_reader from postgres;
