-- Market reports per agent — agent-branded, CLIENT-FACING local-market snapshots.
--
-- The "Send Market Report to a client" flow matches a contact's city/state to
-- the Data Center market warehouse (market_geographies + market_metrics), then
-- freezes a headline snapshot (ZHVI / median sale price / inventory / days on
-- market with MoM/YoY deltas) into snapshot_json. The agent shares it as a link
-- (/market-report/[id]) via the existing email/SMS composer.
--
-- Mirrors cma_reports (20260511000000_cma_reports.sql):
--   * one row per generation event, owned by an agent
--   * the report stays FROZEN in snapshot_json even if the warehouse churns
--   * optionally linked to the contact it was sent to
--   * agent-scoped RLS for select/insert/delete; the public /market-report/[id]
--     page reads via the service-role client (no public policy needed)
--
-- agent_id type follows public.agents.id (uuid OR bigint) — same runtime branch
-- as cma_reports so this works on either schema shape.

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
      create table if not exists public.market_reports (
        id uuid primary key default gen_random_uuid(),
        agent_id uuid not null references public.agents(id) on delete cascade,
        contact_id uuid references public.contacts(id) on delete set null,

        -- Matched Data Center geography (metro or state).
        geo_level text not null,
        geo_code text not null,
        geo_name text,

        -- The contact's city/state at the time of the match (for display + audit).
        subject_city text,
        subject_state text,

        -- Frozen headline snapshot (stats + deltas + as-of period + source).
        snapshot_json jsonb not null,

        created_at timestamptz not null default now()
      )
    $sql$;
  elsif v_agent_type in ('bigint', 'int8') then
    execute $sql$
      create table if not exists public.market_reports (
        id uuid primary key default gen_random_uuid(),
        agent_id bigint not null references public.agents(id) on delete cascade,
        contact_id uuid references public.contacts(id) on delete set null,

        geo_level text not null,
        geo_code text not null,
        geo_name text,

        subject_city text,
        subject_state text,

        snapshot_json jsonb not null,

        created_at timestamptz not null default now()
      )
    $sql$;
  else
    raise exception 'Unsupported public.agents.id type for market_reports: %', v_agent_type;
  end if;
end $$;

comment on table public.market_reports is
  'Per-agent, client-facing local-market report snapshots. Built by matching a contact''s city/state to the Data Center warehouse and freezing the headline metrics into snapshot_json, so the shared /market-report/[id] link stays stable even as the warehouse updates.';

comment on column public.market_reports.snapshot_json is
  'Frozen headline snapshot: { geoName, geoLevel, asOfPeriod, dataHref, source, stats:[{metric,label,value,unit,formatted,momPct?,yoyPct?}] }.';

-- ── indexes ──────────────────────────────────────────────────────

create index if not exists idx_market_reports_agent_created
  on public.market_reports (agent_id, created_at desc);

create index if not exists idx_market_reports_contact
  on public.market_reports (contact_id)
  where contact_id is not null;

-- ── RLS ──────────────────────────────────────────────────────────
-- Copy of cma_reports' policy shape: agent can select/insert/delete their own
-- rows via the agents.auth_user_id = auth.uid() join. Public read for the
-- shareable page happens through the service-role client in the page loader
-- (frozen snapshot, safe to expose), so there is intentionally no public policy.

alter table public.market_reports enable row level security;

drop policy if exists "market_reports_select_own" on public.market_reports;
create policy "market_reports_select_own"
  on public.market_reports
  for select
  using (
    exists (
      select 1 from public.agents
      where agents.id = market_reports.agent_id
        and agents.auth_user_id = auth.uid()
    )
  );

drop policy if exists "market_reports_insert_own" on public.market_reports;
create policy "market_reports_insert_own"
  on public.market_reports
  for insert
  with check (
    exists (
      select 1 from public.agents
      where agents.id = market_reports.agent_id
        and agents.auth_user_id = auth.uid()
    )
  );

drop policy if exists "market_reports_delete_own" on public.market_reports;
create policy "market_reports_delete_own"
  on public.market_reports
  for delete
  using (
    exists (
      select 1 from public.agents
      where agents.id = market_reports.agent_id
        and agents.auth_user_id = auth.uid()
    )
  );
