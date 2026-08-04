-- Weekly schedule content type: each weekday slot can now produce a text post or
-- an image post (a branded card rendered from the researched topic). Image posts
-- unlock Instagram + Pinterest (both require an image) alongside Facebook /
-- LinkedIn / Threads. 'video' is reserved for a future topic->video engine.
alter table public.social_weekly_schedules
  add column if not exists media_type text not null default 'text'
    check (media_type in ('text', 'image', 'video'));
