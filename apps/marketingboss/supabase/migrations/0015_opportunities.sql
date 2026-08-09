-- MarketingBoss 2.0 Phase 3 — Opportunities. The discovery feed: the best
-- things the business could do next, found continuously from multiple sources,
-- scored, and each one explaining WHY. The AI recommends; the human decides
-- (status stays 'open' until the user accepts or dismisses).

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null,               -- 'trends' | 'competitors' | 'performance' | 'seasonal' | ...
  title text not null,
  description text not null,
  reasoning text not null,            -- the WHY, always present
  business_value text,                -- narrative value estimate
  reach text check (reach in ('low', 'medium', 'high')),
  urgency text check (urgency in ('low', 'medium', 'high')),
  confidence numeric,                 -- 0..1
  score numeric not null default 0,   -- computed rank for the feed
  recommended_action jsonb,           -- { type: text|image|video, intent: prefill for the composer }
  status text not null default 'open'
    check (status in ('open', 'accepted', 'dismissed', 'expired')),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists opportunities_user_open_idx
  on public.opportunities (user_id, status, score desc, created_at desc);

-- Owner-scoped RLS, same posture as campaigns: a user sees only their own feed.
-- Server routes go through the service-role client and scope by user_id.
alter table public.opportunities enable row level security;

create policy "opportunities_owner_all" on public.opportunities
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
