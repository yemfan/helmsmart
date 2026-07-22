-- Threads (Meta) organic-posting support for Generate Leads + the brand
-- auto-poster.
--
-- Threads has its own API (graph.threads.net) and its own OAuth grant — it's
-- in the Meta family and reuses the same *developer app*, but the Facebook Page
-- token can't post to Threads. So we model the CONNECTION like LinkedIn (a
-- standalone `platform`, its own OAuth routes, its own token column) and the
-- PUBLISHER like Instagram (a two-step container → publish flow).
--
-- Three schema changes, mirroring 20260629000000_linkedin_organic.sql:
--   1. social_accounts.platform check widens to include 'threads', plus a
--      `threads_user_id` identity column + a partial unique index per
--      (agent_id, platform, threads_user_id).
--   2. lead_posts.platform check widens to include 'threads'.
--   3. scheduled_posts + recurring_posts platform checks widen to include
--      'threads'.

-- ── 1. social_accounts: Threads account discriminator + columns ──────────────

alter table public.social_accounts
  drop constraint if exists social_accounts_platform_check;

alter table public.social_accounts
  add constraint social_accounts_platform_check
    check (platform in ('meta', 'linkedin', 'threads', 'x', 'google'));

alter table public.social_accounts
  add column if not exists threads_user_id text,
  add column if not exists threads_username text;

-- One connection per (agent_id, platform, Threads user id) — re-connecting the
-- same Threads account upserts instead of duplicating. Partial index, same
-- shape as social_accounts_linkedin_unique.
create unique index if not exists social_accounts_threads_unique
  on public.social_accounts (agent_id, platform, threads_user_id)
  where threads_user_id is not null;

comment on column public.social_accounts.threads_user_id is
  'Threads user id (from graph.threads.net /me) — the {user-id} in the /threads publish endpoints.';

-- ── 2. lead_posts: widen platform ───────────────────────────────────────────

alter table public.lead_posts
  drop constraint if exists lead_posts_platform_check;

alter table public.lead_posts
  add constraint lead_posts_platform_check
    check (platform in ('facebook', 'instagram', 'linkedin', 'threads'));

-- ── 3. scheduled_posts + recurring_posts: widen platform ─────────────────────

alter table public.scheduled_posts
  drop constraint if exists scheduled_posts_platform_check;

alter table public.scheduled_posts
  add constraint scheduled_posts_platform_check
    check (platform in ('facebook', 'instagram', 'linkedin', 'threads'));

alter table public.recurring_posts
  drop constraint if exists recurring_posts_platform_check;

alter table public.recurring_posts
  add constraint recurring_posts_platform_check
    check (platform in ('facebook', 'instagram', 'linkedin', 'threads'));
