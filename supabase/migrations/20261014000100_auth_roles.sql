create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'commuter'
    check (role in ('commuter', 'employer', 'authority', 'admin'))
);

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120)
);

create table public.memberships (
  user_id uuid not null references public.profiles (id) on delete cascade,
  org_id uuid not null references public.organisations (id) on delete cascade,
  primary key (user_id, org_id)
);

alter table public.profiles enable row level security;
alter table public.organisations enable row level security;
alter table public.memberships enable row level security;

revoke all on public.profiles, public.organisations, public.memberships from anon, authenticated;
grant select on public.profiles, public.organisations, public.memberships to authenticated;
grant all on public.profiles, public.organisations, public.memberships to service_role;

create policy "Users read their own role" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

create policy "Employers read their own memberships" on public.memberships
  for select to authenticated using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid()) and profiles.role = 'employer'
    )
  );

create policy "Members read their organisation" on public.organisations
  for select to authenticated using (
    exists (
      select 1 from public.memberships
      where memberships.org_id = organisations.id
        and memberships.user_id = (select auth.uid())
    )
  );

create function public.create_commuter_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role) values (new.id, 'commuter');
  return new;
end;
$$;

revoke all on function public.create_commuter_profile() from public, anon, authenticated;

create trigger create_commuter_after_signup
  after insert on auth.users
  for each row execute function public.create_commuter_profile();
