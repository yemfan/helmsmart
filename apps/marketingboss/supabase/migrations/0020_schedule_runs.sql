-- Weekly schedule v3 — multiple RUNS per day. A run is a time-of-day plus its
-- own content type and channels; aggressive users add 2-3 runs and the topic
-- rotation advances PER RUN (two runs in one day get two different topics).
--
-- runs:      [{ "hour": 9, "minute": 0, "mediaType": "image", "channels": null }]
--            null = legacy single run from post_hour/post_minute/media_type/channels.
-- fired_key: per-run dedupe for the cron's optimistic claim —
--            "YYYY-MM-DD:0,1" = runs 0 and 1 already fired on that local date.
--            (last_fired_on stays for legacy rows / pre-migration fallback.)

alter table public.weekly_schedules
  add column if not exists runs jsonb,
  add column if not exists fired_key text;
