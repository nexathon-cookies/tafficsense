-- Extend the existing authority workflow with a labelled rejection outcome and
-- an authority-only audit reader. Rejection removes an incident from public
-- active views; it does not assert that no disruption occurred.
create or replace function public.authority_update_incident(
  p_incident_id uuid,
  p_action text
) returns jsonb
language plpgsql
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  caller_id uuid;
  caller_role text;
  target_incident record;
begin
  caller_id := (select auth.uid());
  if caller_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select role into caller_role from public.profiles where id = caller_id;
  if caller_role is distinct from 'authority' then
    raise exception 'Authority permission required.' using errcode = '42501';
  end if;

  select * into target_incident from public.incidents where id = p_incident_id;
  if target_incident.id is null then
    raise exception 'Incident not found.' using errcode = 'P0002';
  end if;
  if target_incident.status <> 'open' then
    raise exception 'Only open incidents can be reviewed.' using errcode = '22023';
  end if;

  if p_action = 'confirm' then
    update public.incidents
    set level = 'L6', level_reason = 'Officially confirmed by Traffic Authority',
        authority_confirmed_by = caller_id, provenance = 'authority', last_confirmed_at = clock_timestamp()
    where id = p_incident_id;
    insert into public.incident_audit_log (action, actor_id, incident_id, details)
    values ('confirm_incident', caller_id, p_incident_id, jsonb_build_object('level', 'L6'));
  elsif p_action = 'resolve' then
    update public.incidents
    set status = 'resolved', level_reason = 'Cleared and resolved by Traffic Authority', last_confirmed_at = clock_timestamp()
    where id = p_incident_id;
    insert into public.incident_audit_log (action, actor_id, incident_id, details)
    values ('resolve_incident', caller_id, p_incident_id, jsonb_build_object('status', 'resolved'));
  elsif p_action = 'reject' then
    update public.incidents
    set status = 'resolved', level_reason = 'Rejected by Traffic Authority', last_confirmed_at = clock_timestamp()
    where id = p_incident_id;
    insert into public.incident_audit_log (action, actor_id, incident_id, details)
    values ('reject_incident', caller_id, p_incident_id, jsonb_build_object('status', 'rejected'));
  else
    raise exception 'Unsupported action. Use confirm, resolve or reject.' using errcode = '22023';
  end if;

  return jsonb_build_object('ok', true, 'action', p_action);
end;
$$;

revoke all on function public.authority_update_incident(uuid, text) from public;
grant execute on function public.authority_update_incident(uuid, text) to authenticated;

create or replace function public.read_authority_incident_history(p_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  caller_role text;
  capped_limit integer := greatest(1, least(coalesce(p_limit, 20), 100));
begin
  select role into caller_role from public.profiles where id = (select auth.uid());
  if caller_role is distinct from 'authority' then
    raise exception 'Authority permission required.' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', log.id,
      'incident_id', log.incident_id,
      'action', log.action,
      'category', incident.category,
      'created_at', log.created_at,
      'details', log.details
    ) order by log.created_at desc)
    from (
      select * from public.incident_audit_log order by created_at desc limit capped_limit
    ) log
    join public.incidents incident on incident.id = log.incident_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.read_authority_incident_history(integer) from public;
grant execute on function public.read_authority_incident_history(integer) to authenticated;
