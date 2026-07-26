-- Pinterest organic-posting support for Generate Leads + the brand auto-poster.
--
-- Pinterest has its own API (api.pinterest.com/v5) and its own OAuth grant. We
-- model the CONNECTION like LinkedIn/Threads (a standalone `platform`, its own
-- OAuth routes, one token per account) and the PUBLISHER as a single-call Pin
-- create (board_id + image_url + link + title/description). A Pin ALWAYS needs
-- an image and a destination board, so we store a default board on connect.
--
-- Mirrors 20260722120000_threads_social.sql.

-- ── 1. social_accounts: Pinterest discriminator + columns ────────────────────

alter table public.social_accounts
  drop constraint if exists social_accounts_platform_check;

alter table public.social_accounts
  add constraint social_accounts_platform_check
    check (platform in ('meta', 'linkedin', 'threads', 'x', 'google', 'pinterest'));

alter table public.social_accounts
  add column if not exists pinterest_username text,
  add column if not exists pinterest_board_id text,
  add column if not exists pinterest_board_name text,
  -- Pinterest access tokens expire in ~30 days; the refresh token (~1 year)
  -- lets a future refresh cron mint a new one without a re-connect.
  add column if not exists pinterest_refresh_token_enc text;

-- One connection per (agent_id, platform, pinterest username) — re-connecting
-- the same account upserts instead of duplicating. Partial index, same shape as
-- social_accounts_threads_unique.
create unique index if not exists social_accounts_pinterest_unique
  on public.social_accounts (agent_id, platform, pinterest_username)
  where pinterest_username is not null;

comment on column public.social_accounts.pinterest_board_id is
  'Default Pinterest board id that new Pins are created on (chosen at connect).';

-- ── 2. lead_posts / scheduled_posts / recurring_posts: widen platform ────────

alter table public.lead_posts
  drop constraint if exists lead_posts_platform_check;
alter table public.lead_posts
  add constraint lead_posts_platform_check
    check (platform in ('facebook', 'instagram', 'linkedin', 'threads', 'pinterest'));

alter table public.scheduled_posts
  drop constraint if exists scheduled_posts_platform_check;
alter table public.scheduled_posts
  add constraint scheduled_posts_platform_check
    check (platform in ('facebook', 'instagram', 'linkedin', 'threads', 'pinterest'));

-- recurring_posts is guarded: its migration never reached some environments.
do $$
begin
  if to_regclass('public.recurring_posts') is not null then
    alter table public.recurring_posts
      drop constraint if exists recurring_posts_platform_check;
    alter table public.recurring_posts
      add constraint recurring_posts_platform_check
        check (platform in ('facebook', 'instagram', 'linkedin', 'threads', 'pinterest'));
  end if;
end $$;
