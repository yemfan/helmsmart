-- Per-job on/off switches for the scheduled jobs.
--
-- The two crons live in vercel.json, which means the only ways to stop one were
-- editing that file and redeploying, or clearing CRON_SECRET — and CRON_SECRET
-- is shared, so it takes both down together. Neither is something you want to
-- reach for at the moment a job starts misbehaving.
--
-- A row per job, read at the top of each route. Toggling is a single UPDATE:
-- no deploy, no build, and one job can be parked while the other keeps running.
--
-- Operator-scoped, not user-scoped: these jobs process every account, so the
-- switch is global. RLS is ON with no policies, which denies anon and
-- authenticated outright — only the service-role client (the crons themselves
-- and the ADMIN_EMAILS-gated API route) can see or change a row.

create table if not exists public.cron_switches (
  job text primary key,
  enabled boolean not null default true,
  -- Why it was parked, so the next person doesn't have to guess whether it was
  -- deliberate or a forgotten experiment.
  note text,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.cron_switches enable row level security;

-- Seed both jobs as enabled — matching how they behave today, so applying this
-- migration on its own changes nothing until somebody flips a switch.
insert into public.cron_switches (job, enabled, note)
values
  ('cron_run', true, 'Main pipeline — /api/cron/run, every 15 minutes.'),
  ('cron_missions', true, 'Mission continuation + reaper — /api/cron/missions, every 5 minutes.')
on conflict (job) do nothing;
