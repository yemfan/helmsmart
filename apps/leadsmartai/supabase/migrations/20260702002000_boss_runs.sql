-- Boss v2 agent loop (HANDOFF_BOSS_V2 PR-3).
--
-- A boss_run is one live plan→act→verify execution of a realtor command (or an
-- overnight objective). Steps are the durable tool-execution ledger — they back
-- the run timeline UI, approval resume, and the (run_id, step_index)
-- idempotency guarantee (unique index below).

create table if not exists public.boss_runs (
  id uuid primary key default gen_random_uuid(),
  agent_id bigint not null references public.agents(id) on delete cascade,
  trigger text not null default 'command' check (trigger in ('command', 'overnight', 'retry')),
  instruction_id uuid references public.boss_instructions(id) on delete set null,
  status text not null default 'planning' check (
    status in ('planning', 'running', 'awaiting_approval', 'completed', 'failed', 'budget_exceeded', 'cancelled')
  ),
  -- The realtor's command (or the overnight objective).
  objective text not null,
  -- Model-produced plan (first turn) — shown in the run timeline.
  plan_json jsonb,
  -- Full Anthropic message transcript; the loop is resumed from this between
  -- chunked invocations and after approvals.
  messages_json jsonb not null default '[]'::jsonb,
  -- Final report-back written on terminal status.
  report text,
  error text,
  tool_calls int not null default 0,
  max_tool_calls int not null default 25,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  token_budget bigint not null default 250000,
  -- One dedicated verification turn runs before completion.
  verify_done boolean not null default false,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_boss_runs_agent on public.boss_runs (agent_id, started_at desc);
create index if not exists idx_boss_runs_live on public.boss_runs (status)
  where status in ('planning', 'running', 'awaiting_approval');

create table if not exists public.boss_run_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.boss_runs(id) on delete cascade,
  step_index int not null,
  tool_name text not null,
  risk_class text not null,
  input_json jsonb not null default '{}'::jsonb,
  output_json jsonb,
  status text not null default 'running' check (
    status in ('running', 'completed', 'pending_approval', 'rejected', 'failed')
  ),
  approval_state text not null default 'n/a' check (
    approval_state in ('n/a', 'pending', 'approved', 'rejected')
  ),
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  -- Idempotency: a retried step claims this key and reads the prior outcome.
  unique (run_id, step_index)
);

create index if not exists idx_boss_run_steps_run on public.boss_run_steps (run_id, step_index);

-- Per-agent Boss v2 opt-in (global env kill switch: BOSS_V2_ENABLED).
alter table public.agent_ai_settings
  add column if not exists boss_v2_enabled boolean not null default false;

-- Service-role only (API routes scope by agent_id) — same posture as
-- scheduled_actions: RLS on, no policies, so anon/session is deny-all.
alter table public.boss_runs enable row level security;
alter table public.boss_run_steps enable row level security;
