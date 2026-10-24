-- Migration: 20261024000100_authority_notifications.sql
-- Real-time Authority Dispatch Notification Queue for spotted incidents with photo evidence.

create table if not exists public.authority_notifications (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  category text not null,
  landmark text not null,
  lat double precision not null,
  lng double precision not null,
  has_photo boolean not null default false,
  photo_summary text,
  level text not null default 'L1',
  reporter_email text,
  is_read boolean not null default false,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists idx_authority_notifications_created_at
  on public.authority_notifications(created_at desc);

create index if not exists idx_authority_notifications_unread
  on public.authority_notifications(is_read) where is_read = false;

alter table public.authority_notifications enable row level security;

-- Only authorities or service role may read notifications
drop policy if exists "Authorities can view notifications" on public.authority_notifications;
create policy "Authorities can view notifications"
  on public.authority_notifications
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'authority'
    ) or (
      auth.jwt() ->> 'email' ilike '%authority%'
    )
  );

-- Only authorities can update notification read status
drop policy if exists "Authorities can update notifications" on public.authority_notifications;
create policy "Authorities can update notifications"
  on public.authority_notifications
  for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'authority'
    ) or (
      auth.jwt() ->> 'email' ilike '%authority%'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'authority'
    ) or (
      auth.jwt() ->> 'email' ilike '%authority%'
    )
  );

-- Function: create authority notification (callable by report submission executor)
create or replace function public.dispatch_authority_notification(
  p_incident_id uuid,
  p_category text,
  p_lat double precision,
  p_lng double precision,
  p_landmark text,
  p_has_photo boolean default false,
  p_photo_summary text default null,
  p_level text default 'L1',
  p_reporter_email text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  inserted_id uuid;
begin
  insert into public.authority_notifications (
    incident_id,
    category,
    landmark,
    lat,
    lng,
    has_photo,
    photo_summary,
    level,
    reporter_email,
    created_at
  ) values (
    p_incident_id,
    p_category,
    coalesce(nullif(trim(p_landmark), ''), 'Monitored Mangaluru Corridor'),
    p_lat,
    p_lng,
    coalesce(p_has_photo, false),
    nullif(trim(p_photo_summary), ''),
    coalesce(p_level, 'L1'),
    nullif(trim(p_reporter_email), ''),
    clock_timestamp()
  )
  returning id into inserted_id;

  return jsonb_build_object('ok', true, 'notification_id', inserted_id);
end;
$$;

revoke all on function public.dispatch_authority_notification(uuid, text, double precision, double precision, text, boolean, text, text, text) from public;
grant execute on function public.dispatch_authority_notification(uuid, text, double precision, double precision, text, boolean, text, text, text) to authenticated;
grant execute on function public.dispatch_authority_notification(uuid, text, double precision, double precision, text, boolean, text, text, text) to service_role;

-- Function: read authority notifications
create or replace function public.read_authority_notifications(
  p_since timestamptz default null,
  p_limit integer default 40
) returns jsonb
language plpgsql
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  caller_id uuid;
  caller_email text;
  is_auth boolean;
  result jsonb;
begin
  caller_id := auth.uid();
  if caller_id is null then
    raise exception 'Authority sign-in required.' using errcode = '42501';
  end if;

  caller_email := auth.jwt() ->> 'email';

  select exists (
    select 1 from public.profiles
    where id = caller_id and role = 'authority'
  ) into is_auth;

  if not is_auth and (caller_email is null or caller_email not ilike '%authority%') then
    raise exception 'Authority role required.' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', n.id,
        'incident_id', n.incident_id,
        'category', n.category,
        'landmark', n.landmark,
        'lat', n.lat,
        'lng', n.lng,
        'has_photo', n.has_photo,
        'photo_summary', n.photo_summary,
        'level', n.level,
        'reporter_email', n.reporter_email,
        'is_read', n.is_read,
        'created_at', n.created_at
      ) order by n.created_at desc
    ),
    '[]'::jsonb
  ) into result
  from (
    select *
    from public.authority_notifications
    where (p_since is null or created_at > p_since)
    order by created_at desc
    limit least(greatest(coalesce(p_limit, 40), 1), 100)
  ) n;

  return jsonb_build_object('ok', true, 'notifications', result);
end;
$$;

revoke all on function public.read_authority_notifications(timestamptz, integer) from public;
grant execute on function public.read_authority_notifications(timestamptz, integer) to authenticated;

-- Function: mark authority notifications as read
create or replace function public.mark_authority_notification_read(
  p_notification_id uuid default null,
  p_all boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  caller_id uuid;
  caller_email text;
  is_auth boolean;
  affected integer;
begin
  caller_id := auth.uid();
  if caller_id is null then
    raise exception 'Authority sign-in required.' using errcode = '42501';
  end if;

  caller_email := auth.jwt() ->> 'email';

  select exists (
    select 1 from public.profiles
    where id = caller_id and role = 'authority'
  ) into is_auth;

  if not is_auth and (caller_email is null or caller_email not ilike '%authority%') then
    raise exception 'Authority role required.' using errcode = '42501';
  end if;

  if p_all then
    update public.authority_notifications
    set is_read = true
    where is_read = false;
    get diagnostics affected = row_count;
  elsif p_notification_id is not null then
    update public.authority_notifications
    set is_read = true
    where id = p_notification_id;
    get diagnostics affected = row_count;
  else
    affected := 0;
  end if;

  return jsonb_build_object('ok', true, 'affected', affected);
end;
$$;

revoke all on function public.mark_authority_notification_read(uuid, boolean) from public;
grant execute on function public.mark_authority_notification_read(uuid, boolean) to authenticated;
