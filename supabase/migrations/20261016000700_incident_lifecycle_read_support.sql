grant incident_lifecycle_reader, incident_lifecycle_executor to postgres;
grant execute on function public.evaluate_incident_lifecycle(uuid, text, text, timestamptz) to incident_lifecycle_reader;

-- Late evidence may withdraw a current claim, never rewrite or promote its recorded transition.
create or replace function public.project_incident_lifecycle(p_read_at timestamptz)
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
  ), checked as (
    select v.*, case when v.kind = 'supported' and v.current_context and p_read_at < v.support_deadline then
      (public.evaluate_incident_lifecycle(v.run_id, v.segment_id, v.direction, p_read_at)->'slowdown')
        @> jsonb_build_object('status', 'supported', 'window_end', public.incident_lifecycle_timestamp(v.support_end))
      -- An invalid accepted prefix remains withdrawn even if a later equal-terminal cohort qualifies.
      and not exists (
        select 1 from public.speed_evidence_batches b
        where b.run_id = v.run_id and b.accepted_at >= v.accepted_at and b.accepted_at <= p_read_at
          and ((public.evaluate_incident_lifecycle(v.run_id, v.segment_id, v.direction, b.accepted_at)->'slowdown')
            @> jsonb_build_object('status', 'supported', 'window_end', public.incident_lifecycle_timestamp(v.support_end))) is not true
      )
      else false end as has_current_support
    from visible v
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
      when p_read_at >= v.support_deadline then 'stale'
      when v.kind = 'withdrawn' or v.has_current_support is not true then 'unconfirmed' else 'supported' end,
    'current_context', v.current_context, 'prior_cycle_id', v.prior_cycle_id,
    'complete_source_count', v.complete_source_count, 'slow_source_count', v.slow_source_count,
    'recovery_source_count', case when v.kind = 'cleared' then v.continuous_source_count else 0 end,
    'valid_until', public.incident_lifecycle_timestamp(case when v.kind <> 'cleared' then v.support_deadline end),
    'provenance', 'simulated', 'cause', 'unknown'
  ) order by v.started_at, v.id), '[]'::jsonb) from checked v;
$$;
revoke incident_lifecycle_reader, incident_lifecycle_executor from postgres;
