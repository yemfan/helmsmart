-- app_memberships — differentiate the apps that share one auth.users.
--
-- RealtyBoss (leadsmart), PropertyTools, and mobile share a SINGLE Supabase
-- auth.users, so authentication (the credential) is shared across all of them.
-- This table is the AUTHORIZATION layer: which apps a given identity may use and
-- with what role. It becomes the single source of truth for "which apps is this
-- user in?".
--
-- NON-BREAKING: this establishes + backfills + keeps the source of truth in
-- sync, but does NOT gate login. Enforcement (rejecting / auto-provisioning a
-- user who lacks a membership for the app they open) is a deliberate later step,
-- because that is where lock-out risk lives.

create table if not exists public.app_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  app text not null check (app in ('leadsmart', 'propertytools', 'mobile')),
  role text not null default 'member',
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, app)
);

create index if not exists idx_app_memberships_user on public.app_memberships (user_id);
create index if not exists idx_app_memberships_app on public.app_memberships (app);

-- Shared-DB RLS posture (#621): RLS on, no policies — access only via the
-- service-role client (memberships are read/written server-side).
alter table public.app_memberships enable row level security;

-- ── Backfill from the existing per-app tables ────────────────────────────────
-- leadsmart_users carries the canonical role, so it is inserted first and wins
-- over the agents fill (which only adds a membership for agents that have no
-- leadsmart_users row).
-- The `user_id in (select id from auth.users)` guards skip orphaned per-app rows
-- whose auth user was deleted — the FK would otherwise reject the whole backfill.
insert into public.app_memberships (user_id, app, role)
select user_id, 'leadsmart', coalesce(nullif(trim(role), ''), 'member')
from public.leadsmart_users
where user_id is not null
  and user_id in (select id from auth.users)
on conflict (user_id, app) do nothing;

insert into public.app_memberships (user_id, app, role)
select auth_user_id, 'leadsmart', 'agent'
from public.agents
where auth_user_id is not null
  and auth_user_id in (select id from auth.users)
on conflict (user_id, app) do nothing;

insert into public.app_memberships (user_id, app, role)
select user_id, 'propertytools', coalesce(nullif(trim(tier), ''), 'member')
from public.propertytools_users
where user_id is not null
  and user_id in (select id from auth.users)
on conflict (user_id, app) do nothing;

-- ── Keep in sync going forward (triggers) ────────────────────────────────────
-- Maintain memberships regardless of which app or code path writes the per-app
-- row (both web apps, OAuth bootstrap, admin tools). SECURITY DEFINER so the
-- trigger can write app_memberships past RLS; the exception guard makes sync
-- best-effort so a membership hiccup can NEVER break the underlying signup.

create or replace function public.sync_leadsmart_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not null then
    insert into public.app_memberships (user_id, app, role)
    values (new.user_id, 'leadsmart', coalesce(nullif(trim(new.role), ''), 'member'))
    on conflict (user_id, app) do update
      set role = excluded.role, updated_at = now();
  end if;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists trg_leadsmart_membership on public.leadsmart_users;
create trigger trg_leadsmart_membership
after insert or update of role on public.leadsmart_users
for each row execute function public.sync_leadsmart_membership();

create or replace function public.sync_agent_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.auth_user_id is not null then
    -- Don't override an existing (possibly richer) leadsmart role.
    insert into public.app_memberships (user_id, app, role)
    values (new.auth_user_id, 'leadsmart', 'agent')
    on conflict (user_id, app) do nothing;
  end if;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists trg_agent_membership on public.agents;
create trigger trg_agent_membership
after insert or update of auth_user_id on public.agents
for each row execute function public.sync_agent_membership();

create or replace function public.sync_propertytools_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not null then
    insert into public.app_memberships (user_id, app, role)
    values (new.user_id, 'propertytools', coalesce(nullif(trim(new.tier), ''), 'member'))
    on conflict (user_id, app) do update
      set role = excluded.role, updated_at = now();
  end if;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists trg_propertytools_membership on public.propertytools_users;
create trigger trg_propertytools_membership
after insert or update of tier on public.propertytools_users
for each row execute function public.sync_propertytools_membership();
