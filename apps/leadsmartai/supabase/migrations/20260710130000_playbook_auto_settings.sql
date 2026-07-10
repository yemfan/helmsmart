-- Per-agent auto-start settings for playbook runs.
--
-- Opt-in toggles: when on, a new listing_rep/dual transaction auto-starts a
-- house_selling playbook (the listing agreement is signed), and a new buyer_rep
-- transaction auto-starts a house_buying playbook (the buyer is engaged).
-- Default OFF — agents turn it on in Playbook runs settings.
--
-- agent_id type follows public.agents.id (uuid OR bigint); agent-scoped RLS
-- copied from playbook_runs. Server writes via service-role (bypasses RLS).

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
      create table if not exists public.playbook_auto_settings (
        agent_id uuid primary key references public.agents(id) on delete cascade,
        auto_selling boolean not null default false,
        auto_buying boolean not null default false,
        updated_at timestamptz not null default now()
      )
    $sql$;
  elsif v_agent_type in ('bigint', 'int8') then
    execute $sql$
      create table if not exists public.playbook_auto_settings (
        agent_id bigint primary key references public.agents(id) on delete cascade,
        auto_selling boolean not null default false,
        auto_buying boolean not null default false,
        updated_at timestamptz not null default now()
      )
    $sql$;
  else
    raise exception 'Unsupported public.agents.id type for playbook_auto_settings: %', v_agent_type;
  end if;
end $$;

alter table public.playbook_auto_settings enable row level security;

drop policy if exists "playbook_auto_settings_select_own" on public.playbook_auto_settings;
create policy "playbook_auto_settings_select_own" on public.playbook_auto_settings for select
  using (exists (select 1 from public.agents where agents.id = playbook_auto_settings.agent_id and agents.auth_user_id = auth.uid()));
drop policy if exists "playbook_auto_settings_upsert_own" on public.playbook_auto_settings;
create policy "playbook_auto_settings_upsert_own" on public.playbook_auto_settings for insert
  with check (exists (select 1 from public.agents where agents.id = playbook_auto_settings.agent_id and agents.auth_user_id = auth.uid()));
drop policy if exists "playbook_auto_settings_update_own" on public.playbook_auto_settings;
create policy "playbook_auto_settings_update_own" on public.playbook_auto_settings for update
  using (exists (select 1 from public.agents where agents.id = playbook_auto_settings.agent_id and agents.auth_user_id = auth.uid()))
  with check (exists (select 1 from public.agents where agents.id = playbook_auto_settings.agent_id and agents.auth_user_id = auth.uid()));
