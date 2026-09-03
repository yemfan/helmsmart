-- Smart Lists — saved, named filters over contacts.
--
-- Agents save named filters and switch between them as tabs above the contact
-- list. Three defaults ship with every agent (Leads, Sphere, All contacts);
-- agents add their own, and can hide a default but not delete it.
--
-- WHY THIS FILE EXISTS AT ALL. This table was written months ago as
-- 20260480200000_smart_lists.sql and never applied, because that filename is
-- not a timestamp: 2026-04-80, the eightieth of April. It sat in the repo
-- alongside a "contacts consolidation" batch that drops live tables, so nobody
-- could apply it by running the folder. Meanwhile the read path degraded
-- quietly (listSmartLists swallows a missing relation and returns []) while the
-- write path did not, so "Add" returned a 500 and the feature looked alive
-- until an agent used it.
--
-- The old file is deleted in the same commit. Not merely superseded: its
-- "idempotent preamble" opened with
--     drop table if exists public.smart_lists cascade;
-- so had anyone ever run the folder afterwards, it would have taken every
-- custom list with it. An idempotent migration must be safe to re-run against
-- a table with data in it, and that one was only safe against an empty one.
--
-- This file is re-runnable without destroying anything: create if not exists,
-- replaceable functions, and seeds that no-op on conflict.

create table if not exists public.smart_lists (
  id uuid primary key default gen_random_uuid(),
  agent_id bigint not null references public.agents(id) on delete cascade,

  name text not null,
  description text,
  icon text,                       -- optional lucide-react icon name

  -- Filter shape, validated app-side rather than in the DB:
  --   {"lifecycle_stage":["lead"],"rating":["A"],"source":["Zillow"],
  --    "dormant_days_gte":90,"query":"free text"}
  filter_config jsonb not null default '{}'::jsonb,

  sort_order integer not null default 0,

  -- System defaults are seeded per agent. They can be hidden (is_hidden) but
  -- not deleted, so the base segmentation stays consistent across the product.
  is_default boolean not null default false,
  is_hidden boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (agent_id, name)
);

create index if not exists idx_smart_lists_agent_sort
  on public.smart_lists(agent_id, sort_order);

-- ── Row level security ──────────────────────────────────────────────────────
-- The app reads and writes these through the service-role client, which
-- bypasses RLS — so this is not what makes the feature work. It is what stops
-- anyone else reading another agent's lists if the table is ever touched from
-- a session client. Scoping lives in the policy's own USING clause, on the
-- owner column, because policies are OR'd: a permissive policy added later
-- widens every query that leaned on this one.
alter table public.smart_lists enable row level security;

drop policy if exists smart_lists_owner_all on public.smart_lists;
create policy smart_lists_owner_all on public.smart_lists
  for all
  using (
    exists (
      select 1 from public.agents a
      where a.id = smart_lists.agent_id
        and a.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.agents a
      where a.id = smart_lists.agent_id
        and a.auth_user_id = auth.uid()
    )
  );

-- ── Defaults ────────────────────────────────────────────────────────────────
-- Seed every agent that already exists. `on conflict do nothing` makes this
-- re-runnable and means an agent who renamed a default keeps their name.
insert into public.smart_lists (agent_id, name, description, filter_config, sort_order, is_default)
select a.id,
       'Leads',
       'Active pipeline — new inquiries and in-progress deals.',
       '{"lifecycle_stage":["lead","active_client"]}'::jsonb,
       0,
       true
from public.agents a
on conflict (agent_id, name) do nothing;

insert into public.smart_lists (agent_id, name, description, filter_config, sort_order, is_default)
select a.id,
       'Sphere',
       'Past clients, referral sources, and non-client sphere contacts.',
       '{"lifecycle_stage":["past_client","sphere","referral_source"]}'::jsonb,
       1,
       true
from public.agents a
on conflict (agent_id, name) do nothing;

insert into public.smart_lists (agent_id, name, description, filter_config, sort_order, is_default)
select a.id,
       'All contacts',
       'Every contact except archived.',
       '{"exclude_lifecycle_stage":["archived"]}'::jsonb,
       2,
       true
from public.agents a
on conflict (agent_id, name) do nothing;

-- New agents get the same three.
create or replace function public.seed_default_smart_lists()
returns trigger language plpgsql as $$
begin
  insert into public.smart_lists (agent_id, name, description, filter_config, sort_order, is_default)
  values
    (new.id, 'Leads',
     'Active pipeline — new inquiries and in-progress deals.',
     '{"lifecycle_stage":["lead","active_client"]}'::jsonb,
     0, true),
    (new.id, 'Sphere',
     'Past clients, referral sources, and non-client sphere contacts.',
     '{"lifecycle_stage":["past_client","sphere","referral_source"]}'::jsonb,
     1, true),
    (new.id, 'All contacts',
     'Every contact except archived.',
     '{"exclude_lifecycle_stage":["archived"]}'::jsonb,
     2, true)
  on conflict (agent_id, name) do nothing;
  return new;
end
$$;

drop trigger if exists trg_agents_seed_smart_lists on public.agents;
create trigger trg_agents_seed_smart_lists
  after insert on public.agents
  for each row execute function public.seed_default_smart_lists();

-- updated_at
create or replace function public.touch_smart_lists_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists trg_smart_lists_updated_at on public.smart_lists;
create trigger trg_smart_lists_updated_at
  before update on public.smart_lists
  for each row execute function public.touch_smart_lists_updated_at();
