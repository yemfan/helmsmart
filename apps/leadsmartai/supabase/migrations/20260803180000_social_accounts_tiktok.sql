-- TikTok as a 6th social platform on social_accounts (alongside meta, linkedin,
-- threads, pinterest). Reuses the shared token columns (user_access_token_enc,
-- user_token_expires_at, scopes, status, account_display_name/picture); adds
-- TikTok-specific identity + its own refresh token (encrypted).
alter table public.social_accounts
  add column if not exists tiktok_open_id text,
  add column if not exists tiktok_username text,
  add column if not exists tiktok_refresh_token_enc text;

-- One row per (agent, TikTok account). Partial index mirrors the pinterest_username one.
create unique index if not exists social_accounts_agent_tiktok_open_id_key
  on public.social_accounts (agent_id, platform, tiktok_open_id)
  where tiktok_open_id is not null;
