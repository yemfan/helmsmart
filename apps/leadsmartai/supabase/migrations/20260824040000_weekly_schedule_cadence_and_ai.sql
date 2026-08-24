-- Weekly social schedule: more than one post a day, and "let the AI decide".
--
-- Until now a weekday slot was exactly one post, at one hour the agent typed
-- in, on one topic the agent typed in. Three additions:
--
--   posts_per_day   how many posts that weekday produces (1-5). The extra
--                   posts are spread through the rest of the day rather than
--                   fired together.
--   time_mode       'fixed' uses post_hour/post_minute as before; 'ai' lets
--                   the planner choose publish times for that weekday.
--   topic_mode      'fixed' uses the typed topic as before; 'ai' lets the
--                   post generator choose a timely topic itself. This is what
--                   makes an empty topic legal - the cron previously skipped
--                   any slot whose topic was blank.
--
-- fired_count_on turns the once-a-day dedupe into an N-a-day one. last_fired_on
-- still records the local calendar day; fired_count_on counts how many posts
-- that day has already produced, and resets whenever the date rolls over.
-- Existing rows keep their behaviour exactly: one post, fixed time, fixed topic.

alter table public.social_weekly_schedules
  add column if not exists posts_per_day smallint not null default 1
    check (posts_per_day between 1 and 5),
  add column if not exists time_mode text not null default 'fixed'
    check (time_mode in ('fixed', 'ai')),
  add column if not exists topic_mode text not null default 'fixed'
    check (topic_mode in ('fixed', 'ai')),
  add column if not exists fired_count_on smallint not null default 0
    check (fired_count_on >= 0);

comment on column public.social_weekly_schedules.posts_per_day is
  'How many posts this weekday produces (1-5). Extras are spread across the day.';
comment on column public.social_weekly_schedules.time_mode is
  'fixed = use post_hour/post_minute; ai = the planner picks publish times.';
comment on column public.social_weekly_schedules.topic_mode is
  'fixed = use the topic column; ai = the generator picks a timely topic.';
comment on column public.social_weekly_schedules.fired_count_on is
  'Posts already produced on last_fired_on. Resets when the local date rolls over.';
