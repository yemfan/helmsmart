-- Compliance audits a broker ran over the team's published posts. One row
-- per run: what was reviewed and every finding, so the last audit is there
-- when the page opens and a run can be compared with the one before it.
-- Findings are a document (post id, agent, kind, severity, quote) —
-- lib/teams/audit.ts owns the shape. Service-role only.

create table if not exists public.team_audits (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  ran_by_agent_id bigint not null references public.agents(id) on delete cascade,
  ran_at timestamptz not null default now(),
  window_days integer not null,
  posts_reviewed integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  findings jsonb not null default '[]'::jsonb
);

comment on table public.team_audits is 'Compliance audit runs over a team''s published posts; findings carry post id, agent, kind, severity and the quoted words.';

create index if not exists idx_team_audits_latest
  on public.team_audits (team_id, ran_at desc);

alter table public.team_audits enable row level security;
