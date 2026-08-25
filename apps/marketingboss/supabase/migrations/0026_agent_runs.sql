-- MarketingBoss 3.0 Phase 1 — Agent runs and steps.
--
-- Durable state for Nina's agent loop. Everything the loop needs lives in these
-- two tables, so any invocation can pick a run up cold — which is what makes the
-- 300s function ceiling survivable: the loop yields near its deadline and a
-- later invocation continues from the transcript.
--
-- `agent_run_steps` is also the ONLY source for the worker activity feed. A
-- worker shows as busy because one of its tools is executing — never because a
-- prompt said so. That keeps the workforce honest: nine idle workers render as
-- idle.

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  mission_id uuid references public.missions (id) on delete cascade,
  -- Which workforce member this run belongs to. 'nina' for the main loop;
  -- a worker id for delegated sub-runs (Phase 3).
  worker text not null default 'nina',
  parent_run_id uuid references public.agent_runs (id) on delete cascade,
  trigger text not null default 'command' check (trigger in ('command', 'cron', 'retry')),
  status text not null default 'planning'
    check (status in ('planning', 'running', 'awaiting_approval', 'completed', 'failed', 'budget_exceeded', 'cancelled')),
  objective text not null,
  plan_json jsonb,                          -- first planning text, surfaced as "the plan"
  messages_json jsonb not null default '[]'::jsonb,  -- the transcript; NEVER shown to the user
  report text,                              -- the final written report
  error text,
  tool_calls int not null default 0,
  max_tool_calls int not null default 20,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  token_budget int not null default 200000,
  credits_spent int not null default 0,
  max_credits int,                          -- per-run generation ceiling (null = mission/account budget)
  verify_done boolean not null default false,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists agent_runs_user_idx
  on public.agent_runs (user_id, started_at desc);
create index if not exists agent_runs_mission_idx
  on public.agent_runs (mission_id, started_at desc);
-- The reaper and the continuation cron both scan on status.
create index if not exists agent_runs_status_idx
  on public.agent_runs (status, started_at);

create table if not exists public.agent_run_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  step_index int not null,
  worker text not null,                     -- drives the activity feed
  tool_name text not null,
  risk_class text not null,                 -- research | draft | generate | publish
  input_json jsonb,
  output_json jsonb,
  -- One plain sentence for the owner. Written at finish; null while running.
  summary text,
  artifact_url text,
  credits_spent int not null default 0,
  status text not null default 'running'
    check (status in ('running', 'completed', 'pending_approval', 'rejected', 'failed')),
  approval_state text not null default 'n/a'
    check (approval_state in ('n/a', 'pending', 'approved', 'rejected')),
  error text,
  created_at timestamptz not null default now(),
  -- The idempotency guarantee: a re-kicked invocation that replays step N gets
  -- the existing row back instead of running the tool (and re-charging) twice.
  unique (run_id, step_index)
);

create index if not exists agent_run_steps_run_idx
  on public.agent_run_steps (run_id, step_index);
-- The approvals inbox reads pending steps across every run.
create index if not exists agent_run_steps_pending_idx
  on public.agent_run_steps (user_id, approval_state, created_at desc);

alter table public.agent_runs enable row level security;
alter table public.agent_run_steps enable row level security;

drop policy if exists "agent_runs_owner_all" on public.agent_runs;
create policy "agent_runs_owner_all" on public.agent_runs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "agent_run_steps_owner_all" on public.agent_run_steps;
create policy "agent_run_steps_owner_all" on public.agent_run_steps
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
