-- Brand marketing auto-post log (RealtyBoss's OWN LinkedIn marketing).
--
-- Tracks which brand posts (lib/realtyboss/brand-social/posts.ts) have been
-- auto-published to which platform, so the cron posts the NEXT unposted one on
-- schedule and never repeats. Brand-global (not agent-scoped) — written only by
-- the cron via the service-role client, never read by the session client.
-- RLS enabled with NO policies => deny-all for everyone except service-role.

create table if not exists public.brand_social_log (
  id uuid primary key default gen_random_uuid(),
  post_key text not null,
  platform text not null,
  external_post_id text,
  external_url text,
  posted_at timestamptz not null default now(),
  unique (platform, post_key)
);

alter table public.brand_social_log enable row level security;
