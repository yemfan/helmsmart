-- Per-agent overrides for the Realtor skills catalog.
--
-- The catalog (lib/realtyboss/skills/catalog.ts) ships default enable + assignee
-- for all 59 skills. This table stores only an agent's DEVIATIONS from those
-- defaults as a JSON map keyed by skill id:
--   { "<skill_id>": { "enabled": bool, "assignee": "<assignee>" }, ... }
-- Resolve = catalog default merged with the agent's override for that skill.
--
-- agent_id type follows public.agents.id (uuid OR bigint); agent-scoped RLS
-- copied from playbook_auto_settings.

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
      create table if not exists public.agent_skill_overrides (
        agent_id uuid primary key references public.agents(id) on delete cascade,
        overrides jsonb not null default '{}'::jsonb,
        updated_at timestamptz not null default now()
      )
    $sql$;
  elsif v_agent_type in ('bigint', 'int8') then
    execute $sql$
      create table if not exists public.agent_skill_overrides (
        agent_id bigint primary key references public.agents(id) on delete cascade,
        overrides jsonb not null default '{}'::jsonb,
        updated_at timestamptz not null default now()
      )
    $sql$;
  else
    raise exception 'Unsupported public.agents.id type for agent_skill_overrides: %', v_agent_type;
  end if;
end $$;

alter table public.agent_skill_overrides enable row level security;

drop policy if exists "agent_skill_overrides_select_own" on public.agent_skill_overrides;
create policy "agent_skill_overrides_select_own" on public.agent_skill_overrides for select
  using (exists (select 1 from public.agents where agents.id = agent_skill_overrides.agent_id and agents.auth_user_id = auth.uid()));
drop policy if exists "agent_skill_overrides_insert_own" on public.agent_skill_overrides;
create policy "agent_skill_overrides_insert_own" on public.agent_skill_overrides for insert
  with check (exists (select 1 from public.agents where agents.id = agent_skill_overrides.agent_id and agents.auth_user_id = auth.uid()));
drop policy if exists "agent_skill_overrides_update_own" on public.agent_skill_overrides;
create policy "agent_skill_overrides_update_own" on public.agent_skill_overrides for update
  using (exists (select 1 from public.agents where agents.id = agent_skill_overrides.agent_id and agents.auth_user_id = auth.uid()))
  with check (exists (select 1 from public.agents where agents.id = agent_skill_overrides.agent_id and agents.auth_user_id = auth.uid()));
