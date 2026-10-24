-- Phase 6 extension: Commuter organisation sharing access
-- Security definer RPC that allows commuters to view organisations where they hold active membership.
-- Prevents commuters from querying raw organisations/memberships tables directly.

create or replace function public.get_commuter_organisations()
returns jsonb
language plpgsql
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  caller_id uuid;
  result jsonb;
begin
  caller_id := (select auth.uid());
  if caller_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id,
    'name', o.name
  ) order by o.name), '[]'::jsonb)
  into result
  from public.memberships m
  join public.organisations o on o.id = m.org_id
  where m.user_id = caller_id;

  return result;
end;
$$;

revoke all on function public.get_commuter_organisations() from public;
grant execute on function public.get_commuter_organisations() to authenticated;
