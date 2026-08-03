-- Weekly social schedule: one row per (agent, weekday). When enabled, the agent
-- picks a time-of-day, channels (null = all connected), and a topic; a cron
-- generates an AI-researched post from the topic and enqueues it into
-- scheduled_posts (drained by the existing publish cron). Service-role only.
create table if not exists public.social_weekly_schedules (
  agent_id bigint not null,
  weekday smallint not null check (weekday between 0 and 6),  -- 0=Sun .. 6=Sat (JS getDay)
  enabled boolean not null default false,
  post_hour smallint not null default 9 check (post_hour between 0 and 23),
  post_minute smallint not null default 0 check (post_minute between 0 and 59),
  timezone text not null default 'America/Los_Angeles',
  platforms text[],                 -- null = all connected text-capable channels
  topic text not null default '',
  last_fired_on date,               -- dedupe: at most one fire per local calendar day
  updated_at timestamptz not null default now(),
  primary key (agent_id, weekday)
);

alter table public.social_weekly_schedules enable row level security;
-- No policies → service-role (supabaseAdmin) only, matching the other social tables.
