-- Allow 'tiktok' in the platform CHECK constraints so TikTok can connect
-- (social_accounts) and publish (scheduled_posts + lead_posts). Widening only —
-- every previously-allowed value stays valid.
alter table public.social_accounts drop constraint if exists social_accounts_platform_check;
alter table public.social_accounts add constraint social_accounts_platform_check
  check (platform = any (array['meta','linkedin','threads','x','google','pinterest','tiktok']));

alter table public.scheduled_posts drop constraint if exists scheduled_posts_platform_check;
alter table public.scheduled_posts add constraint scheduled_posts_platform_check
  check (platform = any (array['facebook','instagram','linkedin','threads','pinterest','tiktok']));

alter table public.lead_posts drop constraint if exists lead_posts_platform_check;
alter table public.lead_posts add constraint lead_posts_platform_check
  check (platform = any (array['facebook','instagram','linkedin','threads','pinterest','tiktok']));
