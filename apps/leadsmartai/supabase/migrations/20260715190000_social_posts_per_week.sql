-- Per-agent social cadence.
--
-- Cadence used to be two hardcoded constants in recommend.ts, which meant "the
-- brand should post daily" and "a new agent shouldn't get 7 drafts a week to
-- review" couldn't both be true. It belongs next to the other per-agent social
-- setting (the autopilot mode), keyed the same way.
--
-- NULL = the default (3/week: 1 timely + 2 evergreen), so every existing row
-- keeps its current behaviour without a backfill. This is also the column a
-- "posts per week" control in the Marketing Assistant would bind to; the UI
-- isn't built yet, and this deliberately doesn't wait for it.

alter table public.boss_autopilot_settings
  add column if not exists posts_per_week smallint;

alter table public.boss_autopilot_settings
  drop constraint if exists boss_autopilot_settings_posts_per_week_check;

alter table public.boss_autopilot_settings
  add constraint boss_autopilot_settings_posts_per_week_check
  check (posts_per_week is null or (posts_per_week between 1 and 7));

comment on column public.boss_autopilot_settings.posts_per_week is
  'Social channel only: how many posts to generate + schedule per week (1-7). NULL = default 3. Spread evenly across the week by spreadScheduleTime().';

-- The brand (agent 26) goes daily. Its owned library is ~69 posts, so at 6
-- evergreen/week the rotation is ~11 weeks — a follower does not see repeats.
-- Guarded so this is a no-op wherever agent 26 isn't the brand.
update public.boss_autopilot_settings
   set posts_per_week = 7, updated_at = now()
 where agent_id = 26
   and assignee = 'marketing_assistant'
   and channel = 'social'
   and exists (select 1 from public.agents where id = 26);
