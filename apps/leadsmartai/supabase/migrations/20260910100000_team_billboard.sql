-- The brokerage billboard: what the office wants every agent to see.
-- Managers post news, wins, events, reminders and policy; the system posts
-- a welcome when someone joins. Agents read it on the team page and on
-- their dashboard; a read row per agent tells the broker the reach, and
-- carries their reaction. A post can go out by email too: one queue row
-- per member, drained by a cron a few hundred at a time so a 1,200-agent
-- office does not sit inside one request. Service-role only.

create table if not exists public.team_announcements (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  author_agent_id bigint references public.agents(id) on delete set null,
  kind text not null default 'news' check (kind in ('news', 'win', 'event', 'reminder', 'policy', 'welcome')),
  title text not null,
  body text,
  link_url text,
  -- For a win or a welcome: the agent it is about.
  shoutout_agent_id bigint references public.agents(id) on delete set null,
  pinned boolean not null default false,
  expires_at timestamptz,
  email_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.team_announcements is 'Brokerage billboard posts. kind welcome is system-posted when a member joins.';

create index if not exists idx_team_announcements_team on public.team_announcements (team_id, pinned desc, created_at desc);

create table if not exists public.team_announcement_reads (
  announcement_id uuid not null references public.team_announcements(id) on delete cascade,
  agent_id bigint not null references public.agents(id) on delete cascade,
  read_at timestamptz not null default now(),
  reaction text check (reaction in ('cheer', 'like', 'heart')),
  primary key (announcement_id, agent_id)
);

create table if not exists public.team_announcement_emails (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.team_announcements(id) on delete cascade,
  agent_id bigint not null references public.agents(id) on delete cascade,
  sent_at timestamptz,
  attempts integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  unique (announcement_id, agent_id)
);

create index if not exists idx_team_announcement_emails_queue on public.team_announcement_emails (created_at) where sent_at is null;

alter table public.team_announcements enable row level security;
alter table public.team_announcement_reads enable row level security;
alter table public.team_announcement_emails enable row level security;
