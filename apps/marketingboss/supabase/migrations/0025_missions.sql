-- MarketingBoss 3.0 Phase 1 — Missions.
--
-- A Mission is one objective the owner hands to Nina: "promote my new restaurant
-- for the next 30 days". It sits ABOVE playbooks (campaigns) and actions
-- (campaign_posts) — a mission may create several of each — so nothing here
-- replaces or moves existing data.
--
-- `measured_by` is deliberate: an awareness mission and a traffic mission are
-- not the same campaign, and scoring them with one number is how a learning
-- loop ends up optimising a metric nobody asked for. It is set at creation,
-- shown on the mission page, and is what the learning cohort comparison reads.

create table if not exists public.missions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  objective text not null,                  -- the owner's words, verbatim
  status text not null default 'planning'
    check (status in ('planning', 'running', 'awaiting_approval', 'completed', 'failed', 'cancelled')),
  -- How much Nina may do without asking. 'review' is the only default we will
  -- ever ship: autonomy is the owner's to turn up, never ours to assume.
  autonomy text not null default 'review'
    check (autonomy in ('review', 'assisted', 'auto')),
  -- What success is measured in, and what we can honestly observe.
  measured_by text not null default 'engagement'
    check (measured_by in ('awareness', 'engagement', 'traffic')),
  plan_json jsonb,                          -- the living plan: [{ phase, status, note }]
  budget_credits int,                       -- ceiling for the whole mission (null = account balance)
  spent_credits int not null default 0,
  summary text,                             -- the final report the owner reads
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists missions_user_idx
  on public.missions (user_id, created_at desc);

-- Owner-scoped RLS, same posture as campaigns/opportunities. Server routes go
-- through the service-role client and scope by user_id explicitly.
alter table public.missions enable row level security;

drop policy if exists "missions_owner_all" on public.missions;
create policy "missions_owner_all" on public.missions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
