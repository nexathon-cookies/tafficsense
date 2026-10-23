create function public.valid_demo_line(value jsonb)
returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare point jsonb;
begin
  if jsonb_typeof(value) is distinct from 'object'
    or value ->> 'type' is distinct from 'LineString'
    or jsonb_typeof(value -> 'coordinates') is distinct from 'array'
    or value - 'type' - 'coordinates' <> '{}'::jsonb then
    return false;
  end if;
  if jsonb_array_length(value -> 'coordinates') not between 2 and 100 then return false; end if;
  for point in select * from jsonb_array_elements(value -> 'coordinates') loop
    if jsonb_typeof(point) is distinct from 'array' then return false; end if;
    if jsonb_array_length(point) <> 2
      or jsonb_typeof(point -> 0) is distinct from 'number'
      or jsonb_typeof(point -> 1) is distinct from 'number' then return false; end if;
    if (point ->> 0)::numeric not between -180 and 180
      or (point ->> 1)::numeric not between -90 and 90 then return false; end if;
  end loop;
  return true;
end;
$$;
revoke all on function public.valid_demo_line(jsonb) from public, anon, authenticated;
grant execute on function public.valid_demo_line(jsonb) to service_role;

create table public.demo_traffic_corridors (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  name text not null check (char_length(name) between 1 and 160),
  provenance text not null check (provenance = 'simulated'),
  geometry_note text not null check (char_length(geometry_note) between 1 and 400),
  scenario text not null check (scenario in ('normal', 'slowdown', 'recovery')),
  anchor_at timestamptz not null check (anchor_at >= '2000-01-01Z' and anchor_at < '2100-01-01Z'),
  unique (id, anchor_at)
);

create table public.demo_traffic_segments (
  corridor_id text not null references public.demo_traffic_corridors(id) on delete cascade,
  id text not null check (id ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  name text not null check (char_length(name) between 1 and 160),
  direction text not null check (direction in ('outbound', 'inbound')),
  geometry jsonb not null check (public.valid_demo_line(geometry)),
  length_m integer not null check (length_m between 1 and 100000),
  baseline_seconds integer not null check (baseline_seconds between 1 and 86400),
  baseline_label text not null check (char_length(baseline_label) between 1 and 200),
  primary key (corridor_id, id),
  unique (corridor_id, id, direction)
);

create table public.demo_traffic_routes (
  corridor_id text not null references public.demo_traffic_corridors(id) on delete cascade,
  id text not null check (id ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  name text not null check (char_length(name) between 1 and 160),
  kind text not null check (kind in ('primary', 'alternative')),
  direction text not null check (direction in ('outbound', 'inbound')),
  primary key (corridor_id, id),
  unique (corridor_id, kind),
  unique (corridor_id, id, direction)
);

create table public.demo_traffic_route_segments (
  corridor_id text not null,
  route_id text not null,
  segment_id text not null,
  position integer not null check (position between 1 and 50),
  direction text not null,
  primary key (corridor_id, route_id, position),
  unique (corridor_id, route_id, segment_id),
  foreign key (corridor_id, route_id, direction) references public.demo_traffic_routes(corridor_id, id, direction) on delete cascade,
  foreign key (corridor_id, segment_id, direction) references public.demo_traffic_segments(corridor_id, id, direction) on delete cascade
);
create index demo_route_segments_segment on public.demo_traffic_route_segments(corridor_id, segment_id, direction);

create table public.demo_traffic_sources (
  corridor_id text not null,
  id text not null check (id ~ '^[a-z0-9][a-z0-9-]{0,99}$'),
  segment_id text not null,
  label text not null check (char_length(label) between 1 and 200),
  primary key (corridor_id, id),
  unique (corridor_id, segment_id, id),
  foreign key (corridor_id, segment_id) references public.demo_traffic_segments(corridor_id, id) on delete cascade
);

create table public.demo_traffic_observations (
  corridor_id text not null,
  segment_id text not null,
  source_id text not null,
  anchor_at timestamptz not null,
  observed_at timestamptz not null,
  speed_kph numeric(6,2) not null check (speed_kph between 0 and 160),
  provenance text not null default 'simulated' check (provenance = 'simulated'),
  primary key (corridor_id, segment_id, source_id, observed_at),
  foreign key (corridor_id, segment_id, source_id) references public.demo_traffic_sources(corridor_id, segment_id, id) on delete cascade,
  foreign key (corridor_id, anchor_at) references public.demo_traffic_corridors(id, anchor_at) on delete cascade,
  check (observed_at between anchor_at - interval '11 minutes' and anchor_at)
);
create index demo_observations_segment_time on public.demo_traffic_observations(corridor_id, segment_id, observed_at desc);

alter table public.demo_traffic_corridors enable row level security;
alter table public.demo_traffic_segments enable row level security;
alter table public.demo_traffic_routes enable row level security;
alter table public.demo_traffic_route_segments enable row level security;
alter table public.demo_traffic_sources enable row level security;
alter table public.demo_traffic_observations enable row level security;

revoke all on public.demo_traffic_corridors, public.demo_traffic_segments, public.demo_traffic_routes,
  public.demo_traffic_route_segments, public.demo_traffic_sources, public.demo_traffic_observations from anon, authenticated;
grant select on public.demo_traffic_corridors, public.demo_traffic_segments, public.demo_traffic_routes,
  public.demo_traffic_route_segments, public.demo_traffic_sources, public.demo_traffic_observations to anon, authenticated;
grant all on public.demo_traffic_corridors, public.demo_traffic_segments, public.demo_traffic_routes,
  public.demo_traffic_route_segments, public.demo_traffic_sources, public.demo_traffic_observations to service_role;

create policy "Public synthetic corridors" on public.demo_traffic_corridors for select to anon, authenticated using (provenance = 'simulated');
create policy "Public synthetic segments" on public.demo_traffic_segments for select to anon, authenticated using (true);
create policy "Public synthetic routes" on public.demo_traffic_routes for select to anon, authenticated using (true);
create policy "Public synthetic route order" on public.demo_traffic_route_segments for select to anon, authenticated using (true);
create policy "Public synthetic sources" on public.demo_traffic_sources for select to anon, authenticated using (true);
create policy "Public synthetic observations" on public.demo_traffic_observations for select to anon, authenticated using (provenance = 'simulated');

create function public.replace_traffic_demo(p_fixture jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owned_id constant text := 'mangaluru-central-v1';
  anchor timestamptz;
  field text;
begin
  if jsonb_typeof(p_fixture) is distinct from 'object'
    or p_fixture #>> '{corridor,id}' is distinct from owned_id then
    raise exception 'Only the owned traffic demonstration may be replaced.' using errcode = '22023';
  end if;
  foreach field in array array['segments', 'routes', 'route_segments', 'sources', 'observations'] loop
    if jsonb_typeof(p_fixture -> field) is distinct from 'array' then
      raise exception 'Fixture collections must be arrays.' using errcode = '22023';
    end if;
    if jsonb_array_length(p_fixture -> field) not between 1 and 5000 then
      raise exception 'Fixture collection size is invalid.' using errcode = '22023';
    end if;
  end loop;
  anchor := (p_fixture #>> '{corridor,anchor_at}')::timestamptz;
  perform pg_advisory_xact_lock(72861, 3);
  delete from public.demo_traffic_corridors where id = owned_id;
  insert into public.demo_traffic_corridors(id, name, provenance, geometry_note, scenario, anchor_at)
  values (owned_id, p_fixture #>> '{corridor,name}', p_fixture #>> '{corridor,provenance}',
    p_fixture #>> '{corridor,geometry_note}', p_fixture #>> '{corridor,scenario}', anchor);

  insert into public.demo_traffic_segments(corridor_id, id, name, direction, geometry, length_m, baseline_seconds, baseline_label)
  select owned_id, id, name, direction, geometry, length_m, baseline_seconds, baseline_label
  from jsonb_to_recordset(p_fixture -> 'segments') as rows(id text, name text, direction text, geometry jsonb, length_m integer, baseline_seconds integer, baseline_label text);

  insert into public.demo_traffic_routes(corridor_id, id, name, kind, direction)
  select owned_id, id, name, kind, direction
  from jsonb_to_recordset(p_fixture -> 'routes') as rows(id text, name text, kind text, direction text);

  insert into public.demo_traffic_route_segments(corridor_id, route_id, segment_id, position, direction)
  select owned_id, route_id, segment_id, position, direction
  from jsonb_to_recordset(p_fixture -> 'route_segments') as rows(route_id text, segment_id text, position integer, direction text);

  if (select count(*) from public.demo_traffic_routes where corridor_id = owned_id) <> 2 or exists (
    select r.id from public.demo_traffic_routes r
    left join public.demo_traffic_route_segments s on s.corridor_id = r.corridor_id and s.route_id = r.id
    where r.corridor_id = owned_id group by r.id
    having count(s.position) = 0 or min(s.position) <> 1 or max(s.position) <> count(s.position)
  ) then
    raise exception 'Both routes require contiguous segment positions starting at one.' using errcode = '23514';
  end if;

  insert into public.demo_traffic_sources(corridor_id, id, segment_id, label)
  select owned_id, id, segment_id, label
  from jsonb_to_recordset(p_fixture -> 'sources') as rows(id text, segment_id text, label text);

  insert into public.demo_traffic_observations(corridor_id, segment_id, source_id, anchor_at, observed_at, speed_kph)
  select owned_id, segment_id, source_id, anchor, observed_at, speed_kph
  from jsonb_to_recordset(p_fixture -> 'observations') as rows(segment_id text, source_id text, observed_at timestamptz, speed_kph numeric);

  return jsonb_build_object('corridor_id', owned_id, 'scenario', p_fixture #>> '{corridor,scenario}',
    'observations', jsonb_array_length(p_fixture -> 'observations'));
end;
$$;
revoke all on function public.replace_traffic_demo(jsonb) from public, anon, authenticated;
grant execute on function public.replace_traffic_demo(jsonb) to service_role;

create function public.reset_traffic_demo()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(72861, 3);
  delete from public.demo_traffic_corridors where id = 'mangaluru-central-v1';
end;
$$;
revoke all on function public.reset_traffic_demo() from public, anon, authenticated;
grant execute on function public.reset_traffic_demo() to service_role;
