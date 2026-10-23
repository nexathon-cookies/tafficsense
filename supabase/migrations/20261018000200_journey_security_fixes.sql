-- Plan 4 (revised) Security Fixes on Journeys and Sharing
-- Security Rule 1: Commuters cannot directly UPDATE journey delay, evidence level, or status.
-- Security Rule 2: Sharing is allowed only if the caller owns the journey AND is a member of that organisation.
-- All mutations on commuter_journeys and journey_employer_shares must go through security definer RPCs.

-- 1. Revoke direct INSERT and UPDATE on commuter_journeys and journey_employer_shares
revoke insert, update, delete on public.commuter_journeys from authenticated;
revoke insert, update, delete on public.journey_employer_shares from authenticated;

-- Ensure SELECT remains allowed for own journeys and shares
grant select on public.commuter_journeys to authenticated;
grant select on public.journey_employer_shares to authenticated;

-- 2. Secure RPC to start a journey
create or replace function public.start_commuter_journey(p_corridor_name text default 'Mangaluru Central Demonstration Corridor')
returns jsonb
language plpgsql
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  caller_id uuid;
  new_journey_id uuid;
begin
  caller_id := (select auth.uid());
  if caller_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  insert into public.commuter_journeys (
    user_id,
    corridor_id,
    corridor_name,
    status,
    estimated_delay_seconds,
    evidence_level,
    provenance
  ) values (
    caller_id,
    'mangaluru-central-v1',
    coalesce(p_corridor_name, 'Mangaluru Central Demonstration Corridor'),
    'active',
    480, -- simulated demonstration delay
    'L3',
    'simulated'
  )
  returning id into new_journey_id;

  return jsonb_build_object('ok', true, 'journeyId', new_journey_id);
end;
$$;

revoke all on function public.start_commuter_journey(text) from public;
grant execute on function public.start_commuter_journey(text) to authenticated;

-- 3. Secure RPC to end a journey
create or replace function public.end_commuter_journey(p_journey_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  caller_id uuid;
  found_id uuid;
begin
  caller_id := (select auth.uid());
  if caller_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select id into found_id
  from public.commuter_journeys
  where id = p_journey_id and user_id = caller_id and status = 'active';

  if found_id is null then
    raise exception 'Active journey not found or access denied.' using errcode = '42501';
  end if;

  update public.commuter_journeys
  set status = 'ended', ended_at = clock_timestamp()
  where id = p_journey_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.end_commuter_journey(uuid) from public;
grant execute on function public.end_commuter_journey(uuid) to authenticated;

-- 4. Secure RPC to share a journey with an employer organisation
-- Enforces: caller owns the journey AND caller is registered in public.memberships for p_org_id
create or replace function public.share_commuter_journey(p_journey_id uuid, p_org_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  caller_id uuid;
  journey_owner uuid;
  is_org_member boolean;
begin
  caller_id := (select auth.uid());
  if caller_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  -- Verify journey ownership
  select user_id into journey_owner
  from public.commuter_journeys
  where id = p_journey_id and status = 'active';

  if journey_owner is null or journey_owner <> caller_id then
    raise exception 'Journey not found or not active.' using errcode = '42501';
  end if;

  -- Verify membership: caller must belong to the organisation
  select exists (
    select 1 from public.memberships
    where user_id = caller_id and org_id = p_org_id
  ) into is_org_member;

  if not is_org_member then
    raise exception 'Access denied: caller is not a member of the specified organisation.' using errcode = '42501';
  end if;

  -- Upsert share
  insert into public.journey_employer_shares (
    journey_id,
    user_id,
    org_id,
    status,
    shared_at,
    stopped_at,
    provenance
  ) values (
    p_journey_id,
    caller_id,
    p_org_id,
    'active',
    clock_timestamp(),
    null,
    'simulated'
  )
  on conflict (journey_id, org_id) do update set
    status = 'active',
    shared_at = clock_timestamp(),
    stopped_at = null;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.share_commuter_journey(uuid, uuid) from public;
grant execute on function public.share_commuter_journey(uuid, uuid) to authenticated;

-- 5. Secure RPC to stop sharing a journey
create or replace function public.stop_sharing_commuter_journey(p_journey_id uuid, p_org_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  caller_id uuid;
begin
  caller_id := (select auth.uid());
  if caller_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  update public.journey_employer_shares
  set status = 'stopped', stopped_at = clock_timestamp()
  where journey_id = p_journey_id and org_id = p_org_id and user_id = caller_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.stop_sharing_commuter_journey(uuid, uuid) from public;
grant execute on function public.stop_sharing_commuter_journey(uuid, uuid) to authenticated;
