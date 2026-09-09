-- A broker's one-click nudge: from an attention reason on the team page
-- ("no hub yet", "no network connected", ...), email every agent in that
-- bucket. This table remembers who was nudged for what and when, so the
-- same agent is not emailed about the same thing twice in a week however
-- often the broker clicks. Service-role only: written by the nudge action,
-- read by it for the cooldown. No client policy.

create table if not exists public.team_nudges (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  agent_id bigint not null references public.agents(id) on delete cascade,
  reason text not null,
  sent_by_agent_id bigint not null references public.agents(id) on delete cascade,
  sent_at timestamptz not null default now()
);

comment on table public.team_nudges is 'One row per nudge email a broker sent an agent about an attention reason; read back for the 7-day cooldown.';

create index if not exists idx_team_nudges_cooldown
  on public.team_nudges (team_id, reason, agent_id, sent_at desc);

alter table public.team_nudges enable row level security;
