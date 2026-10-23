create function public.read_traffic_demo()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'read_at', statement_timestamp(),
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
