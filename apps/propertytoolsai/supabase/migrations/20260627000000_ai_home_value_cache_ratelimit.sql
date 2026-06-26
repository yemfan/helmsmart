-- AI Home Value Estimator (Claude + web_search) support tables.
--
-- The estimator moved off RentCast to the shared @repo/valuation engine. Each
-- estimate is now a ~15-40s Claude web-search call, so a public/guest page
-- needs two guards (see lib/homeValue/aiCache.ts + aiEstimate.ts):
--   1. ai_home_value_cache  — durable per-normalized-address cache so repeat
--      lookups of the same address are instant + free (reused for N days).
--   2. ai_home_value_ip_usage — per-IP daily counter to bound guest abuse.
--
-- Both are written only via the service-role server client. RLS is enabled
-- with no policies so the anon/session client can't touch them (service role
-- bypasses RLS) — consistent with the app's RLS posture.

create table if not exists public.ai_home_value_cache (
  address_key text primary key,
  response_json jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_home_value_cache_created_at_idx
  on public.ai_home_value_cache (created_at);

create table if not exists public.ai_home_value_ip_usage (
  ip text not null,
  usage_date date not null,
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (ip, usage_date)
);

alter table public.ai_home_value_cache enable row level security;
alter table public.ai_home_value_ip_usage enable row level security;
