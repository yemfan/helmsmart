-- Persisted skill runs — so a skill invoked from the Boss ("write me a listing
-- description for 123 Main St") has a viewable output + a small history.
--
-- agent_id type follows public.agents.id (uuid OR bigint); agent-scoped RLS
-- copied from playbook_runs.

do $$
declare
  v_agent_type text;
begin
  select a.atttypid::regtype::text into v_agent_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'agents' and a.attname = 'id'
    and a.attnum > 0 and not a.attisdropped
  limit 1;
  if v_agent_type is null then raise exception 'public.agents.id column not found'; end if;

  if v_agent_type = 'uuid' then
    execute $sql$
      create table if not exists public.skill_runs (
        id uuid primary key default gen_random_uuid(),
        agent_id uuid not null references public.agents(id) on delete cascade,
        skill_id text not null,
        assignee text,
        inputs jsonb not null default '{}'::jsonb,
        output text not null,
        gate jsonb,
        created_at timestamptz not null default now()
      )
    $sql$;
  elsif v_agent_type in ('bigint', 'int8') then
    execute $sql$
      create table if not exists public.skill_runs (
        id uuid primary key default gen_random_uuid(),
        agent_id bigint not null references public.agents(id) on delete cascade,
        skill_id text not null,
        assignee text,
        inputs jsonb not null default '{}'::jsonb,
        output text not null,
        gate jsonb,
        created_at timestamptz not null default now()
      )
    $sql$;
  else
    raise exception 'Unsupported public.agents.id type for skill_runs: %', v_agent_type;
  end if;
end $$;

create index if not exists idx_skill_runs_agent on public.skill_runs (agent_id, created_at desc);

alter table public.skill_runs enable row level security;

drop policy if exists "skill_runs_select_own" on public.skill_runs;
create policy "skill_runs_select_own" on public.skill_runs for select
  using (exists (select 1 from public.agents where agents.id = skill_runs.agent_id and agents.auth_user_id = auth.uid()));
drop policy if exists "skill_runs_insert_own" on public.skill_runs;
create policy "skill_runs_insert_own" on public.skill_runs for insert
  with check (exists (select 1 from public.agents where agents.id = skill_runs.agent_id and agents.auth_user_id = auth.uid()));
drop policy if exists "skill_runs_delete_own" on public.skill_runs;
create policy "skill_runs_delete_own" on public.skill_runs for delete
  using (exists (select 1 from public.agents where agents.id = skill_runs.agent_id and agents.auth_user_id = auth.uid()));
