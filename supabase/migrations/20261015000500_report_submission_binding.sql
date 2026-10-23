grant traffic_report_executor to postgres with set true;
grant create on schema public to traffic_report_executor;

create or replace function public.submit_traffic_report(p_input jsonb)
returns jsonb
language plpgsql security definer set search_path = '' set lock_timeout = '5s' set statement_timeout = '8s'
as $$
declare
  v_source_id uuid;
  v_request_id uuid;
  observation timestamptz;
  receipt timestamptz;
  source_status text;
  field text;
  existing public.traffic_reports_private%rowtype;
  projection public.public_traffic_reports%rowtype;
  v_public_id uuid;
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
  if (p_input ->> 'source_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or (p_input ->> 'request_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or (p_input ->> 'segment_id') !~ '^[a-z0-9][a-z0-9-]{0,79}$'
    or p_input ->> 'direction' not in ('outbound', 'inbound')
    or p_input ->> 'category' not in ('accident', 'road_repair', 'flood', 'landslide', 'festival', 'strike', 'vip_movement', 'heavy_traffic', 'road_closed', 'other', 'unknown')
    or (p_input ->> 'observed_at') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' then
    return jsonb_build_object('status', 'invalid');
  end if;
  begin
    v_source_id := (p_input ->> 'source_id')::uuid;
    v_request_id := (p_input ->> 'request_id')::uuid;
    observation := (p_input ->> 'observed_at')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then
    return jsonb_build_object('status', 'invalid');
  end;
  if to_char(observation at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') <> p_input ->> 'observed_at' then
    return jsonb_build_object('status', 'invalid');
  end if;
  perform pg_advisory_xact_lock(72861, 3);
  source_status := public.report_source_status(v_source_id);
  if source_status <> 'ready' then return jsonb_build_object('status', source_status); end if;
  select r.* into existing from public.traffic_reports_private r where r.source_id = v_source_id and r.request_id = v_request_id;
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
    or (select count(*) from public.traffic_reports_private r where r.source_id = v_source_id
      and received_at > receipt - interval '15 minutes') >= 5 then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  v_public_id := gen_random_uuid();
  insert into public.traffic_reports_private (source_id, request_id, public_id, canonical_input, received_at)
    values (v_source_id, v_request_id, v_public_id, p_input, receipt);
  insert into public.public_traffic_reports (id, segment_id, direction, category, observed_at, received_at)
    values (v_public_id, p_input ->> 'segment_id', p_input ->> 'direction', p_input ->> 'category', observation, receipt)
    returning * into projection;
  return jsonb_build_object('status', 'accepted', 'report', to_jsonb(projection), 'replayed', false);
exception when lock_not_available then
  return jsonb_build_object('status', 'denied');
end;
$$;

revoke create on schema public from traffic_report_executor;
revoke traffic_report_executor from postgres;
