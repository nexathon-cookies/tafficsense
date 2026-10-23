grant traversal_executor, traversal_reader to postgres;
grant create on schema public to traversal_executor;

create function public.expected_completed_traversal_exit(
  p_run_id uuid, p_batch_id uuid, p_source_id text, p_segment_id text, p_direction text, p_entered_at timestamptz
)
returns timestamptz language plpgsql stable security definer
set search_path = '' set timezone = 'UTC' set lock_timeout = '5s' set statement_timeout = '15s'
as $$
declare
  segment_length integer;
  anchor timestamptz;
  sample_times timestamptz[];
  sample_speeds numeric[];
  sample_count integer;
  invalid_binding boolean;
  terminal_bound timestamptz;
  cursor_at timestamptz;
  leg_end timestamptz;
  remaining_units numeric;
  rate_units numeric;
  leg_microseconds numeric;
  crossing_microseconds bigint;
  n integer;
begin
  if p_run_id is null or p_batch_id is null or p_source_id is null or p_segment_id is null
    or p_direction is null or p_entered_at is null or not isfinite(p_entered_at) then return null; end if;
  select d.length_m, b.anchor_at into segment_length, anchor
    from public.speed_evidence_segments d
    join public.speed_evidence_sources s on s.run_id = d.run_id and s.segment_id = d.segment_id and s.direction = d.direction
    join public.speed_evidence_batches b on b.run_id = s.run_id
    where d.run_id = p_run_id and b.batch_id = p_batch_id and s.source_id = p_source_id
      and d.segment_id = p_segment_id and d.direction = p_direction;
  if not found or not isfinite(anchor) or anchor < '2000-01-01T00:00:00Z'::timestamptz
    or anchor >= '2100-01-01T00:00:00Z'::timestamptz then return null; end if;
  select array_agg(o.observed_at order by m.observed_at), array_agg(o.speed_kph order by m.observed_at),
    bool_or(o.observed_at is null or o.segment_id is distinct from p_segment_id or o.direction is distinct from p_direction)
    into sample_times, sample_speeds, invalid_binding
    from public.speed_evidence_batch_samples m
    left join public.speed_evidence_observations o
      on o.run_id = m.run_id and o.source_id = m.source_id and o.observed_at = m.observed_at
    where m.run_id = p_run_id and m.batch_id = p_batch_id and m.source_id = p_source_id;
  sample_count := coalesce(cardinality(sample_times), 0);
  if sample_count < 6 or sample_count > 5000 or invalid_binding is distinct from false then return null; end if;
  terminal_bound := anchor + interval '20 minutes';
  if p_entered_at < sample_times[1] or p_entered_at >= terminal_bound then return null; end if;

  -- Validate the entire selected batch/source schedule, even if exit precedes a malformed later point.
  for n in 1..sample_count loop
    if sample_times[n] is null or not isfinite(sample_times[n]) or sample_times[n] > anchor
      or sample_speeds[n] is null or sample_speeds[n] not between 0 and 160
      or mod(extract(epoch from anchor - sample_times[n]) * 1000000, 60000000) <> 0
      or (n > 1 and sample_times[n] - sample_times[n - 1] <> interval '1 minute') then return null; end if;
  end loop;

  -- One distance unit is 1/360,000,000 metre; all arithmetic stays integral numeric until the final timestamp.
  remaining_units := segment_length::numeric * 360000000;
  cursor_at := p_entered_at;
  for n in 1..sample_count loop
    leg_end := case when n < sample_count then sample_times[n + 1] else terminal_bound end;
    if leg_end <= cursor_at then continue; end if;
    rate_units := sample_speeds[n] * 100;
    leg_microseconds := extract(epoch from leg_end - cursor_at) * 1000000;
    if rate_units > 0 and rate_units * leg_microseconds >= remaining_units then
      crossing_microseconds := ceil(remaining_units / rate_units)::bigint;
      return cursor_at + crossing_microseconds * interval '1 microsecond';
    end if;
    remaining_units := remaining_units - rate_units * leg_microseconds;
    cursor_at := leg_end;
  end loop;
  return null;
end;
$$;
alter function public.expected_completed_traversal_exit(uuid, uuid, text, text, text, timestamptz) owner to traversal_executor;
revoke all on function public.expected_completed_traversal_exit(uuid, uuid, text, text, text, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.expected_completed_traversal_exit(uuid, uuid, text, text, text, timestamptz)
  to traversal_executor, traversal_reader, postgres;

-- Keep the applied admission/projection contracts and owners; fail rather than patch an unexpected definition.
do $$
declare
  definition text;
  admission_anchor constant text := '  if existing then return public.check_completed_traversal(supplied.traversal_id); end if;';
  projection_anchor constant text := '        or distance_m <> length_m';
begin
  definition := pg_get_functiondef('public.ingest_completed_traversal(jsonb)'::regprocedure);
  if (length(definition) - length(replace(definition, admission_anchor, ''))) <> length(admission_anchor) then
    raise exception 'Unexpected traversal admission definition; motion validation was not installed.';
  end if;
  definition := replace(definition, admission_anchor,
    '  if public.expected_completed_traversal_exit(supplied.run_id, supplied.batch_id, supplied.source_id,
    supplied.segment_id, supplied.direction, supplied.entered_at) is distinct from supplied.exited_at then
    return jsonb_build_object(''status'', ''invalid'');
  end if;
' || admission_anchor);
  execute definition;

  definition := pg_get_functiondef('public.project_completed_traversal(uuid,text,text,timestamp with time zone)'::regprocedure);
  if (length(definition) - length(replace(definition, projection_anchor, ''))) <> length(projection_anchor) then
    raise exception 'Unexpected traversal projection definition; legacy motion validation was not installed.';
  end if;
  definition := replace(definition, projection_anchor,
    '        or public.expected_completed_traversal_exit(run_id, batch_id, source_id, segment_id, direction, entered_at)
          is distinct from exited_at
' || projection_anchor);
  execute definition;
end;
$$;

revoke create on schema public from traversal_executor;
revoke traversal_executor, traversal_reader from postgres;
