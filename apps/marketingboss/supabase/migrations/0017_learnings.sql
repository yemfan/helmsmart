-- MarketingBoss 2.0 Phase 5 — Learning. Not analytics: each row answers WHY
-- something worked, backed by evidence from the user's own published posts,
-- and carries a concrete recommendation. Applying a learning points it at a
-- playbook; the planner then folds the insight into every future batch.

create table if not exists public.learnings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  campaign_id uuid references public.campaigns (id) on delete set null,  -- set when applied to a playbook
  insight text not null,            -- "Founder stories outperform product posts 3:1"
  evidence jsonb,                   -- the numbers backing it (cohorts, scores, counts)
  recommendation text not null,     -- what to change, concretely
  applied_at timestamptz,           -- null until the user applies it
  created_at timestamptz not null default now()
);

create index if not exists learnings_user_idx
  on public.learnings (user_id, created_at desc);

-- Owner-scoped RLS; server routes use the service-role client + explicit user_id.
alter table public.learnings enable row level security;

create policy "learnings_owner_all" on public.learnings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
