-- Phase 6: Journeys and consent-based employer sharing
-- Commuter-owned journeys and explicit recipient-specific sharing.
-- Employers can only read allowlisted delay/status summaries for active shared journeys.
-- No coordinates, no geometry, no route history, no raw observations.

create table if not exists public.commuter_journeys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  corridor_id text not null default 'mangaluru-central-v1',
  corridor_name text not null default 'Mangaluru Central Demonstration Corridor',
  status text not null default 'active' check (status in ('active', 'ended')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  estimated_delay_seconds integer not null default 0 check (estimated_delay_seconds >= 0),
  evidence_level text not null default 'L3' check (evidence_level in ('L1', 'L2', 'L3', 'L4')),
  provenance text not null default 'simulated' check (provenance = 'simulated')
);

create table if not exists public.journey_employer_shares (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.commuter_journeys (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  org_id uuid not null references public.organisations (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'stopped')),
  shared_at timestamptz not null default now(),
  stopped_at timestamptz,
  provenance text not null default 'simulated' check (provenance = 'simulated'),
  unique (journey_id, org_id)
);

alter table public.commuter_journeys enable row level security;
alter table public.journey_employer_shares enable row level security;

revoke all on public.commuter_journeys, public.journey_employer_shares from anon, authenticated;
grant select, insert, update on public.commuter_journeys, public.journey_employer_shares to authenticated;
grant all on public.commuter_journeys, public.journey_employer_shares to service_role;

-- Commuters only select/insert/update their own journeys
drop policy if exists "Commuters manage their own journeys" on public.commuter_journeys;
create policy "Commuters manage their own journeys" on public.commuter_journeys
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Commuters only manage their own journey shares
drop policy if exists "Commuters manage their own shares" on public.journey_employer_shares;
create policy "Commuters manage their own shares" on public.journey_employer_shares
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Employers read active shares for their assigned organisations
drop policy if exists "Employers read active organisation shares" on public.journey_employer_shares;
create policy "Employers read active organisation shares" on public.journey_employer_shares
  for select to authenticated
  using (
    status = 'active'
    and exists (
      select 1 from public.memberships m
      join public.profiles p on p.id = m.user_id
      where m.org_id = journey_employer_shares.org_id
        and m.user_id = (select auth.uid())
        and p.role = 'employer'
    )
  );

-- Controlled employer RPC returning only allowlisted fields:
-- journey_id, corridor_name, status, estimated_delay_seconds, evidence_level, shared_at, provenance
create or replace function public.read_employer_shared_journeys(p_org_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  caller_id uuid;
  is_member boolean;
  result jsonb;
begin
  caller_id := (select auth.uid());
  if caller_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  -- Verify caller is employer and member of the organisation
  select exists (
    select 1 from public.memberships m
    join public.profiles p on p.id = m.user_id
    where m.org_id = p_org_id
      and m.user_id = caller_id
      and p.role = 'employer'
  ) into is_member;

  if not is_member then
    raise exception 'Organisation access denied.' using errcode = '42501';
  end if;

  -- Only active shares for currently active journeys
  select coalesce(jsonb_agg(jsonb_build_object(
    'journey_id', j.id,
    'corridor_name', j.corridor_name,
    'status', j.status,
    'estimated_delay_seconds', j.estimated_delay_seconds,
    'evidence_level', j.evidence_level,
    'shared_at', s.shared_at,
    'provenance', 'simulated'
  ) order by s.shared_at desc), '[]'::jsonb)
  into result
  from public.journey_employer_shares s
  join public.commuter_journeys j on j.id = s.journey_id
  where s.org_id = p_org_id
    and s.status = 'active'
    and j.status = 'active';

  return result;
end;
$$;

revoke all on function public.read_employer_shared_journeys(uuid) from public;
grant execute on function public.read_employer_shared_journeys(uuid) to authenticated;
