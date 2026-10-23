-- L5 AI Visual Corroboration & Best Photo Selection for Live Incidents.
alter table public.incidents
  add column if not exists photo_data_url text,
  add column if not exists photo_confidence text;

alter table public.incident_reports
  add column if not exists photo_data_url text,
  add column if not exists photo_confidence text;

-- Replace the earlier 2-argument version so calls cannot resolve ambiguously.
drop function if exists public.apply_incident_photo_verification(uuid, text);

create or replace function public.apply_incident_photo_verification(
  p_incident_id uuid,
  p_summary text default null,
  p_photo_data_url text default null,
  p_confidence_tier text default 'moderate'
) returns jsonb
language plpgsql
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  caller_id uuid;
  new_reason text;
  best_photo text;
  best_conf text;
  affected integer;
begin
  caller_id := (select auth.uid());
  if caller_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.incident_reports
    where incident_id = p_incident_id and reporter_id = caller_id
  ) then
    raise exception 'Only a reporter of this incident can attach photo evidence.' using errcode = '42501';
  end if;

  if p_photo_data_url is not null and length(p_photo_data_url) <= 250000 then
    update public.incident_reports
    set photo_data_url = p_photo_data_url,
        photo_confidence = coalesce(p_confidence_tier, 'moderate')
    where incident_id = p_incident_id and reporter_id = caller_id;
  end if;

  -- Pick the best verified photo among all reports for this incident (high > moderate > low, newest first)
  select r.photo_data_url, r.photo_confidence
  into best_photo, best_conf
  from public.incident_reports r
  where r.incident_id = p_incident_id
    and r.photo_data_url is not null
  order by
    case r.photo_confidence
      when 'high' then 3
      when 'moderate' then 2
      else 1
    end desc,
    r.submitted_at desc
  limit 1;

  new_reason := case
    when p_summary is null or length(trim(p_summary)) = 0
      then 'L5 AI Vision corroborated photo evidence'
    else 'L5 AI Vision corroborated: ' || left(trim(p_summary), 140)
  end;

  update public.incidents
  set level = case when level = 'L6' then 'L6' else 'L5' end,
      level_reason = case when level = 'L6' then level_reason else new_reason end,
      provenance = case when level = 'L6' then provenance else 'verified' end,
      photo_data_url = coalesce(best_photo, photo_data_url),
      photo_confidence = coalesce(best_conf, photo_confidence),
      last_confirmed_at = clock_timestamp()
  where id = p_incident_id
    and status = 'open';
  get diagnostics affected = row_count;

  return jsonb_build_object(
    'ok', affected > 0,
    'level', 'L5',
    'level_reason', new_reason,
    'photo_data_url', best_photo,
    'photo_confidence', best_conf
  );
end;
$$;

revoke all on function public.apply_incident_photo_verification(uuid, text, text, text) from public;
grant execute on function public.apply_incident_photo_verification(uuid, text, text, text) to authenticated;

create or replace function public.read_active_live_incidents()
returns jsonb
language plpgsql
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  result jsonb;
begin
  update public.incidents
  set status = 'expired',
      level_reason = 'Expired due to inactivity (3 hours without confirmation)'
  where status = 'open'
    and last_confirmed_at < (clock_timestamp() - interval '3 hours');

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id,
    'category', i.category,
    'lat', i.lat,
    'lng', i.lng,
    'status', i.status,
    'level', i.level,
    'level_reason', i.level_reason,
    'first_reported_at', i.first_reported_at,
    'last_confirmed_at', i.last_confirmed_at,
    'provenance', i.provenance,
    'photo_data_url', i.photo_data_url,
    'photo_confidence', i.photo_confidence,
    'report_count', (
      select count(*) from public.incident_reports r where r.incident_id = i.id
    )
  ) order by i.last_confirmed_at desc), '[]'::jsonb)
  into result
  from public.incidents i
  where i.status = 'open';

  return result;
end;
$$;

revoke all on function public.read_active_live_incidents() from public;
grant execute on function public.read_active_live_incidents() to anon, authenticated;

-- Prevent subsequent L1/L2/L3 reports from downgrading an already L5-verified incident
create or replace function public.preserve_l5_incident_level()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.level = 'L5' and new.level in ('L1', 'L2', 'L3') then
    new.level := 'L5';
    new.level_reason := old.level_reason;
    new.provenance := 'verified';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_preserve_l5_incident_level on public.incidents;
create trigger trg_preserve_l5_incident_level
  before update on public.incidents
  for each row
  execute function public.preserve_l5_incident_level();
