-- Brokerage training: classes the office posts (mandatory or optional) and a
-- record of who finished each one.
--
-- A class is either scheduled (starts_at, usually with a location or meeting
-- link) or self-paced (no starts_at, usually a materials link). A mandatory
-- class may carry a due date; without one, the class date is the deadline.
-- Completions are the brokerage's attendance record: a manager records them
-- for anyone, an agent can record their own. recorded_by_agent_id says which.
-- Managers add and remove classes; every member reads. Service-role only,
-- like the rest of the team tables: the server actions are the trust boundary.

create table if not exists public.team_trainings (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text check (description is null or char_length(description) <= 2000),
  required boolean not null default false,
  starts_at timestamptz,
  location text check (location is null or char_length(location) <= 300),
  materials_url text,
  due_on date,
  created_by_agent_id bigint not null references public.agents(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.team_trainings is 'Brokerage training classes. required = mandatory for every non-owner member; due_on (or the starts_at date) is the deadline. Self-paced when starts_at is null.';

create index if not exists idx_team_trainings_team
  on public.team_trainings (team_id, created_at desc);

create table if not exists public.team_training_completions (
  training_id uuid not null references public.team_trainings(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  agent_id bigint not null references public.agents(id) on delete cascade,
  completed_at timestamptz not null default now(),
  recorded_by_agent_id bigint references public.agents(id) on delete set null,
  primary key (training_id, agent_id)
);

comment on table public.team_training_completions is 'Who finished which class. recorded_by_agent_id = the agent themselves (self-reported) or a manager (confirmed attendance).';

create index if not exists idx_team_training_completions_team_agent
  on public.team_training_completions (team_id, agent_id);

alter table public.team_trainings enable row level security;
alter table public.team_training_completions enable row level security;
