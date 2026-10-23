-- Journey sharing is consent-based, but this demo does not measure journey time.
-- Do not expose fabricated delay or evidence claims to commuters or employers.

alter table public.commuter_journeys
  alter column estimated_delay_seconds drop not null,
  alter column estimated_delay_seconds drop default,
  alter column evidence_level drop not null,
  alter column evidence_level drop default;

update public.commuter_journeys
set estimated_delay_seconds = null,
    evidence_level = null;

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
    provenance
  ) values (
    caller_id,
    'mangaluru-central-v1',
    coalesce(p_corridor_name, 'Mangaluru Central Demonstration Corridor'),
    'active',
    'simulated'
  )
  returning id into new_journey_id;

  return jsonb_build_object('ok', true, 'journeyId', new_journey_id);
end;
$$;

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

  select coalesce(jsonb_agg(jsonb_build_object(
    'journey_id', j.id,
    'corridor_name', j.corridor_name,
    'status', j.status,
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
