-- Per-day usage counter for paid AI-generation features (House Search,
-- and any future Claude+web_search feature). One row per (user, feature);
-- the count resets when last_reset_date rolls past the current UTC day.
--
-- CMA keeps its own pre-existing counter (cma_daily_usage); this table
-- covers the newer features. Accessed exclusively via the service role
-- (server routes), so RLS is enabled with no policies — the service role
-- bypasses RLS and no client ever reads/writes it directly.

create table if not exists public.ai_feature_usage_daily (
  user_id text not null,
  feature text not null,
  used integer not null default 0,
  last_reset_date date,
  updated_at timestamptz not null default now(),
  primary key (user_id, feature)
);

alter table public.ai_feature_usage_daily enable row level security;
