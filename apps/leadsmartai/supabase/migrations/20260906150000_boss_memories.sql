-- Max memory (UX audit Phase 4).
--
-- Durable notes Max carries into every mission for a realtor: explicit
-- preferences ("always text Mrs. Chen after 5pm"), decisions, and who's-who
-- references ("my Rosewood seller" = contact X). Until now Max's continuity
-- was the last four completed runs pasted into the prompt — enough to resolve
-- "that property" today, gone next week. A chief of staff keeps a notebook.
--
-- Rows are written by Max (remember_note tool, or extraction when a run
-- completes) and by the realtor (Settings › AI team › What Max remembers).
-- Forgetting archives rather than deletes, so a note Max removed by mistake
-- can be audited.

create table if not exists public.boss_memories (
  id uuid primary key default gen_random_uuid(),
  agent_id bigint not null references public.agents(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 400),
  kind text not null default 'fact' check (kind in ('preference', 'decision', 'person', 'fact')),
  -- Who wrote it: Max (tool call or post-run extraction) or the realtor.
  source text not null default 'max' check (source in ('max', 'agent')),
  source_run_id uuid references public.boss_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists idx_boss_memories_agent_active
  on public.boss_memories (agent_id, created_at desc)
  where archived_at is null;

-- Service-role only (API routes scope by agent_id) — same posture as
-- boss_runs: RLS on, no policies, so anon/session is deny-all.
alter table public.boss_memories enable row level security;
