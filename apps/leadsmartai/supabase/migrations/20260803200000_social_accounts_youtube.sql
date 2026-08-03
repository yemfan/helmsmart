-- YouTube as a 7th social platform on social_accounts. Reuses the shared token
-- columns (user_access_token_enc, user_token_expires_at, scopes, status,
-- account_display_name/picture); adds YouTube channel identity + its own refresh
-- token (encrypted). Widens the platform CHECK constraints (connect + publish).
alter table public.social_accounts
  add column if not exists youtube_channel_id text,
  add column if not exists youtube_channel_title text,
  add column if not exists youtube_refresh_token_enc text;

create unique index if not exists social_accounts_agent_youtube_channel_key
  on public.social_accounts (agent_id, platform, youtube_channel_id)
  where youtube_channel_id is not null;

alter table public.social_accounts drop constraint if exists social_accounts_platform_check;
alter table public.social_accounts add constraint social_accounts_platform_check
  check (platform = any (array['meta','linkedin','threads','x','google','pinterest','tiktok','youtube']));

alter table public.scheduled_posts drop constraint if exists scheduled_posts_platform_check;
alter table public.scheduled_posts add constraint scheduled_posts_platform_check
  check (platform = any (array['facebook','instagram','linkedin','threads','pinterest','tiktok','youtube']));

alter table public.lead_posts drop constraint if exists lead_posts_platform_check;
alter table public.lead_posts add constraint lead_posts_platform_check
  check (platform = any (array['facebook','instagram','linkedin','threads','pinterest','tiktok','youtube']));
