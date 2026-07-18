-- Playbook Runs — stateful, multi-phase AI-team engagements.
--
-- Unlike the static checklist playbooks (lib/playbooks) and the one-shot Boss
-- actions (lib/realtyboss/actions), a playbook RUN is a persistent engagement
-- the AI team drives over days/weeks:
--   house_selling — starts after the listing agreement is signed: prep the
--     property, generate a marketing plan + 3 custom ads, execute, and optimize.
--   house_buying  — starts after a buyer is qualified: consultation, build a
--     house-searching plan (criteria/frequency/channel), execute, optimize.
--
-- plan_json holds the LIVING plan (marketing plan / search plan) that the
-- optimize step rewrites over time. artifacts_json is an append-only list of
-- produced deliverables ({kind,title,url}). Phased tasks live in crm_tasks
-- (task_type = 'boss_playbook') linked back via metadata_json.run_id.
--
-- Ownership: agent-scoped RLS (select/insert/update/delete own via the
-- agents.auth_user_id = auth.uid() join), copied from social_post_recommendations.
-- The server writes cross-agent through the service-role client (bypasses RLS).
--
-- agent_id type follows public.agents.id (uuid OR bigint) via the same runtime
-- branch as social_post_recommendations / cma_reports.

do $$
declare
  v_agent_type text;
begin
  select a.atttypid::regtype::text
    into v_agent_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'agents'
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped
  limit 1;

  if v_agent_type is null then
    raise exception 'public.agents.id column not found';
  end if;

  if v_agent_type = 'uuid' then
    execute $sql$
      create table if not exists public.playbook_runs (
        id uuid primary key default gen_random_uuid(),
        agent_id uuid not null references public.agents(id) on delete cascade,
        type text not null check (type in ('house_selling', 'house_buying')),
        contact_id uuid,
        property_address text,
        title text not null,
        phase text not null default 'kickoff',
        status text not null default 'active'
          check (status in ('active', 'paused', 'completed', 'cancelled')),
        plan_json jsonb not null default '{}'::jsonb,
        artifacts_json jsonb not null default '[]'::jsonb,
        next_review_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    $sql$;
  elsif v_agent_type in ('bigint', 'int8') then
    execute $sql$
      create table if not exists public.playbook_runs (
        id uuid primary key default gen_random_uuid(),
        agent_id bigint not null references public.agents(id) on delete cascade,
        type text not null check (type in ('house_selling', 'house_buying')),
        contact_id uuid,
        property_address text,
        title text not null,
        phase text not null default 'kickoff',
        status text not null default 'active'
          check (status in ('active', 'paused', 'completed', 'cancelled')),
        plan_json jsonb not null default '{}'::jsonb,
        artifacts_json jsonb not null default '[]'::jsonb,
        next_review_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    $sql$;
  else
    raise exception 'Unsupported public.agents.id type for playbook_runs: %', v_agent_type;
  end if;
end $$;

comment on table public.playbook_runs is
  'Stateful, multi-phase AI-team engagements (house_selling / house_buying). plan_json = the living marketing/search plan the optimize step rewrites; artifacts_json = append-only list of produced deliverables. Phased tasks live in crm_tasks linked via metadata_json.run_id.';

create index if not exists idx_playbook_runs_agent_status
  on public.playbook_runs (agent_id, status, updated_at desc);
create index if not exists idx_playbook_runs_review
  on public.playbook_runs (status, next_review_at)
  where next_review_at is not null;

-- ── RLS ──────────────────────────────────────────────────────────
alter table public.playbook_runs enable row level security;

drop policy if exists "playbook_runs_select_own" on public.playbook_runs;
create policy "playbook_runs_select_own"
  on public.playbook_runs for select
  using (
    exists (
      select 1 from public.agents
      where agents.id = playbook_runs.agent_id
        and agents.auth_user_id = auth.uid()
    )
  );

drop policy if exists "playbook_runs_insert_own" on public.playbook_runs;
create policy "playbook_runs_insert_own"
  on public.playbook_runs for insert
  with check (
    exists (
      select 1 from public.agents
      where agents.id = playbook_runs.agent_id
        and agents.auth_user_id = auth.uid()
    )
  );

drop policy if exists "playbook_runs_update_own" on public.playbook_runs;
create policy "playbook_runs_update_own"
  on public.playbook_runs for update
  using (
    exists (
      select 1 from public.agents
      where agents.id = playbook_runs.agent_id
        and agents.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.agents
      where agents.id = playbook_runs.agent_id
        and agents.auth_user_id = auth.uid()
    )
  );

drop policy if exists "playbook_runs_delete_own" on public.playbook_runs;
create policy "playbook_runs_delete_own"
  on public.playbook_runs for delete
  using (
    exists (
      select 1 from public.agents
      where agents.id = playbook_runs.agent_id
        and agents.auth_user_id = auth.uid()
    )
  );
