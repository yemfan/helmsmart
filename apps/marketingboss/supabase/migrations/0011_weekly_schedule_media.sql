-- Weekly schedule media type: each weekday slot now produces text, an image, or a
-- video. Text posts go to Facebook/Threads/LinkedIn; image posts add Instagram +
-- Pinterest; video posts go to YouTube + TikTok. The cron generates the media
-- (fal.ai, credit-metered) before enqueuing the scheduled post.
alter table public.weekly_schedules
  add column if not exists media_type text not null default 'text'
    check (media_type in ('text', 'image', 'video'));
