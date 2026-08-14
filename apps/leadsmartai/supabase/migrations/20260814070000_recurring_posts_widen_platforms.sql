-- Widen recurring_post_schedules.platform to the platforms we actually support.
--
-- The table was created when only FB/IG/LinkedIn existed and its CHECK was
-- never updated as Threads, Pinterest, TikTok and YouTube were added. The API
-- (app/api/leads-gen/recurring) already accepts "threads", so a recurring
-- Threads post passed validation and then failed on INSERT against this
-- constraint — the same trap that has bitten the other social tables.
--
-- Matches the platform list already allowed by scheduled_posts and lead_posts.

alter table public.recurring_post_schedules
  drop constraint if exists recurring_post_schedules_platform_check;

alter table public.recurring_post_schedules
  add constraint recurring_post_schedules_platform_check
  check (platform = any (array[
    'facebook'::text,
    'instagram'::text,
    'linkedin'::text,
    'threads'::text,
    'pinterest'::text,
    'tiktok'::text,
    'youtube'::text
  ]));
