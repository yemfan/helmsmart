-- Per-day topics for social autopilot.
--
-- Instead of "N posts a week on auto-spread days", the owner can pick specific
-- weekdays and give each its own topic (a predefined one like 'service' /
-- 'local market', or free text). When day_topics is non-empty it DRIVES the
-- schedule — one post per selected day, on that day — overriding posts_per_week
-- and post_days. Empty (the default) keeps the existing spread behaviour.

alter table public.org_social_autopilot
  add column if not exists day_topics jsonb not null default '{}'::jsonb;

comment on column public.org_social_autopilot.day_topics is
  'Per-weekday topic map, e.g. {"1":"service","3":"local market"} (keys 0=Sun..6=Sat). Presence of a key = post that day; the value is a predefined topic or free text fed to the generator. Non-empty overrides posts_per_week/post_days.';
