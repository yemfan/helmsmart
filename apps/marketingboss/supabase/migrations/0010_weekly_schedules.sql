-- Weekly social schedule: one row per (user, weekday). When enabled, the user
-- picks a time-of-day, channels (null/empty = all connected), and a topic; the
-- /api/cron/run tick researches the topic and enqueues a scheduled campaign_posts
-- row, which the existing drain phase publishes.
create table if not exists public.weekly_schedules (
  user_id uuid not null references auth.users(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),  -- 0=Sun .. 6=Sat
  enabled boolean not null default false,
  post_hour int not null default 9 check (post_hour between 0 and 23),
  post_minute int not null default 0 check (post_minute between 0 and 59),
  timezone text not null default 'America/Los_Angeles',
  channels text[],                 -- null/empty = all connected text-capable channels
  topic text not null default '',
  last_fired_on date,              -- dedupe: at most one fire per local calendar day
  updated_at timestamptz not null default now(),
  primary key (user_id, weekday)
);

alter table public.weekly_schedules enable row level security;

-- Owner can manage their own rows; the cron uses the service-role client (bypasses RLS).
create policy "weekly_schedules_owner_all" on public.weekly_schedules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
