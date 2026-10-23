create role traffic_report_executor nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant traffic_report_executor to postgres;
grant create on schema public to traffic_report_executor;
grant usage on schema public, auth to traffic_report_executor;
grant execute on function auth.uid(), auth.jwt() to traffic_report_executor;
grant select (id, is_anonymous) on auth.users to traffic_report_executor;
create policy "Report executor reads current identity" on auth.users
  for select to traffic_report_executor using (id = (select auth.uid()));

create or replace function public.create_commuter_profile()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.is_anonymous is not true then
    insert into public.profiles (id, role) values (new.id, 'commuter');
  end if;
  return new;
end;
$$;

-- Restrictive policies also protect malformed legacy anonymous profiles.
create policy "Accounts only read profiles" on public.profiles as restrictive
  for select to authenticated using ((select auth.jwt() -> 'is_anonymous') = 'false'::jsonb);
create policy "Accounts only read memberships" on public.memberships as restrictive
  for select to authenticated using ((select auth.jwt() -> 'is_anonymous') = 'false'::jsonb);
create policy "Accounts only read organisations" on public.organisations as restrictive
  for select to authenticated using ((select auth.jwt() -> 'is_anonymous') = 'false'::jsonb);
grant select on public.profiles to traffic_report_executor;
create policy "Report executor reads current account profile" on public.profiles
  for select to traffic_report_executor using (
    id = (select auth.uid()) and (select auth.jwt() -> 'is_anonymous') = 'false'::jsonb
  );

create table public.report_segment_catalog (
  id text primary key,
  corridor_id text not null check (corridor_id = 'mangaluru-central-v1'),
  direction text not null check (direction in ('outbound', 'inbound')),
  unique (id, direction)
);
insert into public.report_segment_catalog (id, corridor_id, direction) values
  ('primary-west', 'mangaluru-central-v1', 'outbound'),
  ('primary-east', 'mangaluru-central-v1', 'outbound'),
  ('alternative-west', 'mangaluru-central-v1', 'outbound'),
  ('alternative-east', 'mangaluru-central-v1', 'outbound'),
  ('primary-west-inbound', 'mangaluru-central-v1', 'inbound');

create table public.reporting_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false
);
insert into public.reporting_settings (id, enabled) values (true, false);

create table public.report_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  kind text not null check (kind in ('account', 'guest')),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz,
  check ((kind = 'account' and expires_at is null)
    or (kind = 'guest' and expires_at = created_at + interval '24 hours'))
);
create index report_sources_expiration on public.report_sources (expires_at) where kind = 'guest';

create table public.traffic_reports_private (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null unique default gen_random_uuid(),
  source_id uuid not null references public.report_sources (id) on delete cascade,
  request_id uuid not null,
  canonical_input jsonb not null check (jsonb_typeof(canonical_input) = 'object' and octet_length(canonical_input::text) <= 2048),
  received_at timestamptz not null default clock_timestamp(),
  unique (source_id, request_id)
);
create index traffic_reports_source_received on public.traffic_reports_private (source_id, received_at);
create index traffic_reports_received on public.traffic_reports_private (received_at);

create table public.public_traffic_reports (
  id uuid primary key references public.traffic_reports_private (public_id) on delete cascade,
  segment_id text not null,
  direction text not null,
  category text not null check (category in ('accident', 'road_repair', 'flood', 'landslide', 'festival', 'strike', 'vip_movement', 'heavy_traffic', 'road_closed', 'other', 'unknown')),
  observed_at timestamptz not null,
  received_at timestamptz not null,
  provenance text not null default 'simulated' check (provenance = 'simulated'),
  location_provenance text not null default 'manual' check (location_provenance = 'manual'),
  foreign key (segment_id, direction) references public.report_segment_catalog (id, direction)
);

alter table public.report_segment_catalog enable row level security;
alter table public.reporting_settings enable row level security;
alter table public.report_sources enable row level security;
alter table public.traffic_reports_private enable row level security;
alter table public.public_traffic_reports enable row level security;
alter table public.report_sources force row level security;
alter table public.traffic_reports_private force row level security;
alter table public.public_traffic_reports force row level security;

revoke all on public.report_segment_catalog, public.reporting_settings, public.report_sources,
  public.traffic_reports_private, public.public_traffic_reports from public, anon, authenticated;
grant select on public.public_traffic_reports, public.reporting_settings to anon, authenticated;
grant all on public.report_segment_catalog, public.reporting_settings, public.report_sources,
  public.traffic_reports_private, public.public_traffic_reports to service_role;
grant select on public.report_segment_catalog, public.reporting_settings, public.report_sources,
  public.traffic_reports_private, public.public_traffic_reports, public.demo_traffic_segments to traffic_report_executor;
grant insert on public.report_sources, public.traffic_reports_private, public.public_traffic_reports to traffic_report_executor;

create policy "Public report projection" on public.public_traffic_reports for select to anon, authenticated using (true);
create policy "Public reporting availability" on public.reporting_settings for select to anon, authenticated using (true);
create policy "Executor catalog" on public.report_segment_catalog for select to traffic_report_executor using (true);
create policy "Executor availability" on public.reporting_settings for select to traffic_report_executor using (true);
create policy "Executor active segments" on public.demo_traffic_segments for select to traffic_report_executor using (corridor_id = 'mangaluru-central-v1');
-- Dataset counts are bounded; only the checked RPCs can access these policies.
create policy "Executor source budget" on public.report_sources for select to traffic_report_executor using (true);
create policy "Executor report budget" on public.traffic_reports_private for select to traffic_report_executor using (true);
create policy "Executor public reports" on public.public_traffic_reports for select to traffic_report_executor using (true);
create policy "Executor creates own source" on public.report_sources for insert to traffic_report_executor
  with check (user_id = (select auth.uid()));
create policy "Executor inserts owned report" on public.traffic_reports_private for insert to traffic_report_executor
  with check (exists (select 1 from public.report_sources s where s.id = source_id and s.user_id = (select auth.uid())));
create policy "Executor inserts owned projection" on public.public_traffic_reports for insert to traffic_report_executor
  with check (exists (select 1 from public.traffic_reports_private r join public.report_sources s on s.id = r.source_id
    where r.public_id = public_traffic_reports.id and s.user_id = (select auth.uid())));

create function public.current_report_identity()
returns text
language sql stable security invoker set search_path = ''
as $$
  select case when u.is_anonymous then 'guest' else 'account' end
  from auth.users u
  where u.id = auth.uid()
    and auth.jwt() -> 'is_anonymous' = to_jsonb(u.is_anonymous)
    and (u.is_anonymous or exists (select 1 from public.profiles p where p.id = u.id
      and p.role in ('commuter', 'employer', 'authority', 'admin')));
$$;
alter function public.current_report_identity() owner to traffic_report_executor;
revoke all on function public.current_report_identity() from public, anon, authenticated, service_role;

create function public.report_source_status(p_source_id uuid)
returns text
language plpgsql security invoker set search_path = ''
as $$
declare
  identity_kind text;
  source public.report_sources%rowtype;
begin
  if not coalesce((select enabled from public.reporting_settings where id), false) then return 'disabled'; end if;
  identity_kind := public.current_report_identity();
  if identity_kind is null then return 'denied'; end if;
  select * into source from public.report_sources where id = p_source_id and user_id = auth.uid();
  if not found or source.kind <> identity_kind then return 'identity_changed'; end if;
  if source.expires_at <= clock_timestamp() then return 'expired'; end if;
  return 'ready';
end;
$$;
alter function public.report_source_status(uuid) owner to traffic_report_executor;
revoke all on function public.report_source_status(uuid) from public, anon, authenticated, service_role;

create function public.prepare_report_source()
returns jsonb
language plpgsql security definer set search_path = '' set lock_timeout = '5s' set statement_timeout = '8s'
as $$
declare
  identity_kind text;
  source public.report_sources%rowtype;
  read_clock timestamptz;
begin
  -- One lock order shared with fixture replacement/reset and report cleanup.
  perform pg_advisory_xact_lock(72861, 3);
  read_clock := clock_timestamp();
  if not coalesce((select enabled from public.reporting_settings where id), false) then return jsonb_build_object('status', 'disabled'); end if;
  identity_kind := public.current_report_identity();
  if identity_kind is null then return jsonb_build_object('status', 'denied'); end if;
  select * into source from public.report_sources where user_id = auth.uid();
  if found then
    if source.kind <> identity_kind then return jsonb_build_object('status', 'denied'); end if;
    if source.expires_at <= read_clock then return jsonb_build_object('status', 'expired'); end if;
  else
    if (select count(*) from public.report_sources) >= 5000 then return jsonb_build_object('status', 'denied'); end if;
    insert into public.report_sources (user_id, kind, created_at, expires_at)
      values (auth.uid(), identity_kind, read_clock, case when identity_kind = 'guest' then read_clock + interval '24 hours' end)
      returning * into source;
  end if;
  return jsonb_build_object('status', 'ready', 'source', jsonb_build_object('id', source.id,
    'kind', source.kind, 'expires_at', source.expires_at), 'read_at', read_clock);
exception when lock_not_available then
  return jsonb_build_object('status', 'denied');
end;
$$;
alter function public.prepare_report_source() owner to traffic_report_executor;
revoke all on function public.prepare_report_source() from public, anon, authenticated, service_role;
grant execute on function public.prepare_report_source() to authenticated;

create function public.submit_traffic_report(p_input jsonb)
returns jsonb
language plpgsql security definer set search_path = '' set lock_timeout = '5s' set statement_timeout = '8s'
as $$
declare
  source_id uuid;
  request_id uuid;
  observation timestamptz;
  receipt timestamptz;
  source_status text;
  field text;
  existing public.traffic_reports_private%rowtype;
  projection public.public_traffic_reports%rowtype;
  public_id uuid;
begin
  if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text) > 2048 then
    return jsonb_build_object('status', 'invalid');
  end if;
  if p_input - array['source_id', 'request_id', 'segment_id', 'direction', 'category', 'observed_at'] <> '{}'::jsonb then
    return jsonb_build_object('status', 'invalid');
  end if;
  foreach field in array array['source_id', 'request_id', 'segment_id', 'direction', 'category', 'observed_at'] loop
    if jsonb_typeof(p_input -> field) is distinct from 'string' then return jsonb_build_object('status', 'invalid'); end if;
  end loop;
  if (p_input ->> 'source_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or (p_input ->> 'request_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or (p_input ->> 'segment_id') !~ '^[a-z0-9][a-z0-9-]{0,79}$'
    or p_input ->> 'direction' not in ('outbound', 'inbound')
    or p_input ->> 'category' not in ('accident', 'road_repair', 'flood', 'landslide', 'festival', 'strike', 'vip_movement', 'heavy_traffic', 'road_closed', 'other', 'unknown')
    or (p_input ->> 'observed_at') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' then
    return jsonb_build_object('status', 'invalid');
  end if;
  begin
    source_id := (p_input ->> 'source_id')::uuid;
    request_id := (p_input ->> 'request_id')::uuid;
    observation := (p_input ->> 'observed_at')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then
    return jsonb_build_object('status', 'invalid');
  end;
  if to_char(observation at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') <> p_input ->> 'observed_at' then
    return jsonb_build_object('status', 'invalid');
  end if;
  perform pg_advisory_xact_lock(72861, 3);
  source_status := public.report_source_status(source_id);
  if source_status <> 'ready' then return jsonb_build_object('status', source_status); end if;
  select r.* into existing from public.traffic_reports_private r
    where r.source_id = submit_traffic_report.source_id and r.request_id = submit_traffic_report.request_id;
  if found then
    if existing.canonical_input <> p_input then return jsonb_build_object('status', 'conflict'); end if;
    select * into projection from public.public_traffic_reports where id = existing.public_id;
    return jsonb_build_object('status', 'accepted', 'report', to_jsonb(projection), 'replayed', true);
  end if;
  receipt := clock_timestamp();
  if observation <= receipt - interval '20 minutes' or observation > receipt then return jsonb_build_object('status', 'invalid'); end if;
  if not exists (select 1 from public.report_segment_catalog c join public.demo_traffic_segments s
    on s.corridor_id = c.corridor_id and s.id = c.id and s.direction = c.direction
    where c.id = p_input ->> 'segment_id' and c.direction = p_input ->> 'direction') then
    return jsonb_build_object('status', 'unavailable_segment');
  end if;
  if (select count(*) from public.traffic_reports_private) >= 2000
    or (select count(*) from public.traffic_reports_private where received_at > receipt - interval '1 hour') >= 300
    or (select count(*) from public.traffic_reports_private r where r.source_id = submit_traffic_report.source_id
      and received_at > receipt - interval '15 minutes') >= 5 then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  public_id := gen_random_uuid();
  insert into public.traffic_reports_private (source_id, request_id, public_id, canonical_input, received_at)
    values (source_id, request_id, public_id, p_input, receipt);
  insert into public.public_traffic_reports (id, segment_id, direction, category, observed_at, received_at)
    values (public_id, p_input ->> 'segment_id', p_input ->> 'direction', p_input ->> 'category', observation, receipt)
    returning * into projection;
  return jsonb_build_object('status', 'accepted', 'report', to_jsonb(projection), 'replayed', false);
exception when lock_not_available then
  return jsonb_build_object('status', 'denied');
end;
$$;
alter function public.submit_traffic_report(jsonb) owner to traffic_report_executor;
revoke all on function public.submit_traffic_report(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.submit_traffic_report(jsonb) to authenticated;

create function public.get_report_acknowledgement(p_source_id uuid, p_request_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' set lock_timeout = '5s' set statement_timeout = '8s'
as $$
declare
  source_status text;
  projection public.public_traffic_reports%rowtype;
begin
  perform pg_advisory_xact_lock(72861, 3);
  source_status := public.report_source_status(p_source_id);
  if source_status <> 'ready' then return jsonb_build_object('status', source_status); end if;
  select p.* into projection from public.public_traffic_reports p join public.traffic_reports_private r on r.public_id = p.id
    where r.source_id = p_source_id and r.request_id = p_request_id;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  return jsonb_build_object('status', 'accepted', 'report', to_jsonb(projection), 'replayed', true);
exception when lock_not_available then
  return jsonb_build_object('status', 'denied');
end;
$$;
alter function public.get_report_acknowledgement(uuid, uuid) owner to traffic_report_executor;
revoke all on function public.get_report_acknowledgement(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_report_acknowledgement(uuid, uuid) to authenticated;

create function public.set_reporting_enabled(p_enabled boolean)
returns jsonb
language plpgsql security invoker set search_path = '' set lock_timeout = '5s'
as $$
begin
  if p_enabled is null then return jsonb_build_object('status', 'invalid'); end if;
  perform pg_advisory_xact_lock(72861, 3);
  update public.reporting_settings set enabled = p_enabled where id;
  return jsonb_build_object('status', 'ready', 'reporting_enabled', p_enabled);
end;
$$;
revoke all on function public.set_reporting_enabled(boolean) from public, anon, authenticated;
grant execute on function public.set_reporting_enabled(boolean) to service_role;

create function public.cleanup_traffic_reports(p_source_ids uuid[] default null)
returns jsonb
language plpgsql security invoker set search_path = '' set lock_timeout = '5s'
as $$
declare removed integer;
begin
  if cardinality(p_source_ids) > 100 then return jsonb_build_object('status', 'invalid'); end if;
  perform pg_advisory_xact_lock(72861, 3);
  if p_source_ids is null and (select enabled from public.reporting_settings where id) then
    return jsonb_build_object('status', 'disabled_required');
  end if;
  delete from public.report_sources where p_source_ids is null or id = any(p_source_ids);
  get diagnostics removed = row_count;
  return jsonb_build_object('status', 'ready', 'sources_removed', removed);
end;
$$;
revoke all on function public.cleanup_traffic_reports(uuid[]) from public, anon, authenticated;
grant execute on function public.cleanup_traffic_reports(uuid[]) to service_role;

create or replace function public.read_traffic_demo()
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'read_at', statement_timestamp(),
    'reporting_enabled', coalesce((select enabled from public.reporting_settings where id), false),
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
revoke create on schema public from traffic_report_executor;
revoke traffic_report_executor from postgres;
