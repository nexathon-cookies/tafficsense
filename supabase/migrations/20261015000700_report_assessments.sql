create role traffic_evidence_reader nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant traffic_evidence_reader to postgres;
grant create on schema public to traffic_evidence_reader;
grant usage on schema public to traffic_evidence_reader;

-- Approved synthetic-only exception: private relationships become fixed public aggregates.
-- Existing report admission limits bound the retained dataset to 2,000 reports.
grant select (public_id, source_id) on public.traffic_reports_private to traffic_evidence_reader;
grant select (id, kind, created_at, expires_at) on public.report_sources to traffic_evidence_reader;
grant select (id, segment_id, direction, observed_at, received_at, provenance, location_provenance)
  on public.public_traffic_reports to traffic_evidence_reader;
grant select (corridor_id, id, direction) on public.demo_traffic_segments to traffic_evidence_reader;

create policy "Evidence private report linkage" on public.traffic_reports_private
  for select to traffic_evidence_reader using (true);
create policy "Evidence source eligibility" on public.report_sources
  for select to traffic_evidence_reader using (true);
create policy "Evidence public reports" on public.public_traffic_reports
  for select to traffic_evidence_reader using (true);
create policy "Evidence active segments" on public.demo_traffic_segments
  for select to traffic_evidence_reader using (corridor_id = 'mangaluru-central-v1');

create function public.read_report_assessments()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  with report_rows as (
    select s.id as segment_id, s.direction, r.id as report_id, r.observed_at, r.received_at,
      p.source_id, source.kind as source_kind, source.expires_at,
      r.provenance = 'simulated' and r.location_provenance = 'manual'
        and r.observed_at <= r.received_at as coherent,
      r.received_at >= source.created_at and (
        (source.kind = 'account' and source.expires_at is null)
        or (source.kind = 'guest' and source.expires_at > statement_timestamp())
      ) as source_eligible
    from public.demo_traffic_segments s
    left join public.public_traffic_reports r on r.segment_id = s.id and r.direction = s.direction
    left join public.traffic_reports_private p on p.public_id = r.id
    left join public.report_sources source on source.id = p.source_id
    where s.corridor_id = 'mangaluru-central-v1'
  ), classified as (
    select *,
      coherent and received_at <= statement_timestamp()
        and observed_at > statement_timestamp() - interval '20 minutes' as recent,
      coherent and received_at <= statement_timestamp()
        and observed_at > statement_timestamp() - interval '15 minutes' and source_eligible as eligible
    from report_rows
  ), assessments as (
    select segment_id, direction,
      count(report_id) as report_count,
      count(report_id) filter (where recent) as recent_report_count,
      count(report_id) filter (where eligible) as eligible_report_count,
      count(distinct source_id) filter (where eligible) as eligible_source_count,
      min(least(
        case when recent then observed_at + interval '20 minutes' end,
        -- Every eligible report matters, including duplicates of a still-eligible source.
        case when eligible then observed_at + interval '15 minutes' end,
        case when eligible and source_kind = 'guest' then expires_at end,
        -- Coherent future projections can become recent when their receipt time arrives.
        case when coherent and received_at > statement_timestamp()
          and observed_at > received_at - interval '20 minutes' then received_at end
      )) as valid_until
    from classified
    group by segment_id, direction
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'segment_id', segment_id, 'direction', direction, 'report_count', report_count,
    'recent_report_count', recent_report_count, 'eligible_report_count', eligible_report_count,
    'eligible_source_count', eligible_source_count, 'multiple_sources', eligible_source_count >= 3,
    'valid_until', valid_until, 'provenance', 'simulated'
  ) order by segment_id, direction), '[]'::jsonb)
  from assessments;
$$;
alter function public.read_report_assessments() owner to traffic_evidence_reader;
revoke all on function public.read_report_assessments() from public, anon, authenticated, service_role;
-- Maintenance lint can inspect the wrapper without inheriting the reader role.
grant execute on function public.read_report_assessments() to anon, authenticated, service_role, postgres;

create or replace function public.read_traffic_demo()
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'read_at', statement_timestamp(),
    'reporting_enabled', coalesce((select enabled from public.reporting_settings where id), false),
    'report_assessments', public.read_report_assessments(),
    'reports', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'segment_id', r.segment_id, 'direction', r.direction, 'category', r.category,
      'observed_at', r.observed_at, 'received_at', r.received_at,
      'provenance', r.provenance, 'location_provenance', r.location_provenance
    ) order by r.received_at, r.id), '[]'::jsonb)
      from public.public_traffic_reports r join public.demo_traffic_segments s
        on s.id = r.segment_id and s.direction = r.direction and s.corridor_id = 'mangaluru-central-v1'),
    'fixture', (
      select jsonb_build_object(
        'corridor', jsonb_build_object(
          'id', c.id, 'name', c.name, 'provenance', c.provenance,
          'geometry_note', c.geometry_note, 'scenario', c.scenario, 'anchor_at', c.anchor_at
        ),
        'segments', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', s.id, 'name', s.name, 'direction', s.direction, 'geometry', s.geometry,
            'length_m', s.length_m, 'baseline_seconds', s.baseline_seconds, 'baseline_label', s.baseline_label
          ) order by s.id), '[]'::jsonb)
          from public.demo_traffic_segments s where s.corridor_id = c.id
        ),
        'routes', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', r.id, 'name', r.name, 'kind', r.kind, 'direction', r.direction
          ) order by r.id), '[]'::jsonb)
          from public.demo_traffic_routes r where r.corridor_id = c.id
        ),
        'route_segments', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'route_id', r.route_id, 'segment_id', r.segment_id, 'position', r.position, 'direction', r.direction
          ) order by r.route_id, r.position), '[]'::jsonb)
          from public.demo_traffic_route_segments r where r.corridor_id = c.id
        ),
        'sources', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', s.id, 'segment_id', s.segment_id, 'label', s.label
          ) order by s.id), '[]'::jsonb)
          from public.demo_traffic_sources s where s.corridor_id = c.id
        ),
        'observations', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'segment_id', o.segment_id, 'source_id', o.source_id,
            'observed_at', o.observed_at, 'speed_kph', o.speed_kph
          ) order by o.observed_at, o.segment_id, o.source_id), '[]'::jsonb)
          from public.demo_traffic_observations o where o.corridor_id = c.id
        )
      )
      from public.demo_traffic_corridors c where c.id = 'mangaluru-central-v1'
    )
  );
$$;
revoke all on function public.read_traffic_demo() from public, anon, authenticated;
grant execute on function public.read_traffic_demo() to anon, authenticated, service_role;
revoke create on schema public from traffic_evidence_reader;
revoke traffic_evidence_reader from postgres;
