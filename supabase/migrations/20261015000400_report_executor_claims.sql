grant traffic_report_executor to postgres;
grant create on schema public to traffic_report_executor;

-- PostgREST supplies verified JWT claims; custom roles cannot obtain Auth-schema grants.
create function public.report_request_claims()
returns jsonb language sql stable security invoker set search_path = ''
as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb); $$;
alter function public.report_request_claims() owner to traffic_report_executor;
revoke all on function public.report_request_claims() from public, anon, authenticated, service_role;

create function public.report_request_user_id()
returns uuid language sql stable security invoker set search_path = ''
as $$ select (public.report_request_claims() ->> 'sub')::uuid; $$;
alter function public.report_request_user_id() owner to traffic_report_executor;
revoke all on function public.report_request_user_id() from public, anon, authenticated, service_role;

drop policy "Report executor reads current identity" on auth.users;
drop policy "Report executor reads current account profile" on public.profiles;
create policy "Report executor reads current account profile" on public.profiles
  for select to traffic_report_executor using (
    id = (select public.report_request_user_id())
    and (select public.report_request_claims() -> 'is_anonymous') = 'false'::jsonb
  );
drop policy "Executor creates own source" on public.report_sources;
create policy "Executor creates own source" on public.report_sources for insert to traffic_report_executor
  with check (user_id = (select public.report_request_user_id()));
drop policy "Executor inserts owned report" on public.traffic_reports_private;
create policy "Executor inserts owned report" on public.traffic_reports_private for insert to traffic_report_executor
  with check (exists (select 1 from public.report_sources s where s.id = source_id and s.user_id = (select public.report_request_user_id())));
drop policy "Executor inserts owned projection" on public.public_traffic_reports;
create policy "Executor inserts owned projection" on public.public_traffic_reports for insert to traffic_report_executor
  with check (exists (select 1 from public.traffic_reports_private r join public.report_sources s on s.id = r.source_id
    where r.public_id = public_traffic_reports.id and s.user_id = (select public.report_request_user_id())));

create or replace function public.current_report_identity()
returns text language sql stable security invoker set search_path = ''
as $$
  select case
    when claims -> 'is_anonymous' = 'true'::jsonb then 'guest'
    when claims -> 'is_anonymous' = 'false'::jsonb and exists (
      select 1 from public.profiles p where p.id = public.report_request_user_id()
        and p.role in ('commuter', 'employer', 'authority', 'admin')) then 'account'
    end
  from (select public.report_request_claims() as claims) request
  where claims ->> 'role' = 'authenticated' and public.report_request_user_id() is not null;
$$;

create or replace function public.report_source_status(p_source_id uuid)
returns text language plpgsql security invoker set search_path = ''
as $$
declare identity_kind text; source public.report_sources%rowtype;
begin
  if not coalesce((select enabled from public.reporting_settings where id), false) then return 'disabled'; end if;
  identity_kind := public.current_report_identity();
  if identity_kind is null then return 'denied'; end if;
  select * into source from public.report_sources where id = p_source_id and user_id = public.report_request_user_id();
  if not found or source.kind <> identity_kind then return 'identity_changed'; end if;
  if source.expires_at <= clock_timestamp() then return 'expired'; end if;
  return 'ready';
end;
$$;

create or replace function public.prepare_report_source()
returns jsonb language plpgsql security definer set search_path = '' set lock_timeout = '5s' set statement_timeout = '8s'
as $$
declare identity_kind text; source public.report_sources%rowtype; read_clock timestamptz;
begin
  perform pg_advisory_xact_lock(72861, 3);
  read_clock := clock_timestamp();
  if not coalesce((select enabled from public.reporting_settings where id), false) then return jsonb_build_object('status', 'disabled'); end if;
  identity_kind := public.current_report_identity();
  if identity_kind is null then return jsonb_build_object('status', 'denied'); end if;
  select * into source from public.report_sources where user_id = public.report_request_user_id();
  if found then
    if source.kind <> identity_kind then return jsonb_build_object('status', 'denied'); end if;
    if source.expires_at <= read_clock then return jsonb_build_object('status', 'expired'); end if;
  else
    if (select count(*) from public.report_sources) >= 5000 then return jsonb_build_object('status', 'rate_limited'); end if;
    insert into public.report_sources (user_id, kind, created_at, expires_at)
      values (public.report_request_user_id(), identity_kind, read_clock, case when identity_kind = 'guest' then read_clock + interval '24 hours' end)
      returning * into source;
  end if;
  return jsonb_build_object('status', 'ready', 'source', jsonb_build_object('id', source.id,
    'kind', source.kind, 'expires_at', source.expires_at), 'read_at', read_clock);
exception when lock_not_available or foreign_key_violation then
  return jsonb_build_object('status', 'denied');
end;
$$;

revoke create on schema public from traffic_report_executor;
revoke traffic_report_executor from postgres;
