-- RealtorBoss — configurable Receptionist call-back ladder.
--
-- The missed-call call-back ladder (lib/missed-call/callbacks.ts) was
-- hardwired to +5/+10/+30 minutes, 3 attempts, then a Boss-feed flag.
-- These columns let each agent configure the cadence from the
-- Receptionist → Voice settings → Missed call tab:
--
--   • callback_enabled          — master switch for the auto call-back
--                                 ladder (text-back can stay on without it).
--   • callback_interval_minutes — minutes between attempts within a day.
--   • callback_max_per_day      — attempts placed per day.
--   • callback_max_days         — how many days to keep trying.
--
-- Total attempts = max_per_day × max_days. When the ladder is exhausted
-- without reaching the caller, the cron now opens a manual "call back"
-- crm_tasks row instead of only flagging the Boss feed.
--
-- Defaults reproduce the prior behavior as closely as a fixed-interval
-- model allows: on, every 30 min, 3 per day, 1 day.

alter table public.missed_call_settings
  add column if not exists callback_enabled boolean not null default true,
  add column if not exists callback_interval_minutes int not null default 30
    check (callback_interval_minutes between 5 and 240),
  add column if not exists callback_max_per_day int not null default 3
    check (callback_max_per_day between 1 and 10),
  add column if not exists callback_max_days int not null default 1
    check (callback_max_days between 1 and 7);

comment on column public.missed_call_settings.callback_enabled is
  'Master switch for the AI auto call-back ladder after a missed call.';
comment on column public.missed_call_settings.callback_interval_minutes is
  'Minutes between call-back attempts within a day (5–240).';
comment on column public.missed_call_settings.callback_max_per_day is
  'Call-back attempts placed per day (1–10).';
comment on column public.missed_call_settings.callback_max_days is
  'Days to keep attempting call-backs before opening a manual task (1–7).';
