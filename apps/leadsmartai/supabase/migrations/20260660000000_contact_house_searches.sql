-- Saved AI House Searches per buyer contact, with a run history.
--
-- A saved search = a natural-language brief tied to a contact. Each refine /
-- re-run appends a row to contact_house_search_runs holding a snapshot of that
-- run's result (interpreted criteria + the listings the AI returned). The
-- latest run is the "current" view; older runs preserve how the search evolved.
--
-- Accessed via the service role (server routes scope every read/write by the
-- owning agent), so RLS is enabled with no policies — the service role bypasses
-- RLS and the session client never touches these tables directly. Mirrors the
-- deep_reports / contact_saved_searches posture.
--
-- auto_run* columns are reserved for a future AGENT-REQUESTED auto-run (a cron
-- re-runs due searches + appends an 'auto' run). v1 is manual; the columns
-- exist now so enabling auto-run later needs no migration.

create table if not exists public.contact_house_searches (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  agent_id bigint not null references public.agents(id) on delete cascade,

  name text not null,
  query text not null,                 -- the natural-language buyer brief

  is_active boolean not null default true,

  -- Future agent-requested auto-run (not executed yet).
  auto_run boolean not null default false,
  auto_run_frequency text,             -- 'daily' | 'weekly' when auto_run
  last_auto_run_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contact_house_searches_contact_idx
  on public.contact_house_searches (contact_id, created_at desc);
create index if not exists contact_house_searches_agent_idx
  on public.contact_house_searches (agent_id, created_at desc);
-- Supports the future auto-run cron query ("due, active, auto_run on").
create index if not exists contact_house_searches_auto_run_idx
  on public.contact_house_searches (last_auto_run_at)
  where auto_run = true and is_active = true;

create table if not exists public.contact_house_search_runs (
  id uuid primary key default gen_random_uuid(),
  search_id uuid not null references public.contact_house_searches(id) on delete cascade,

  refinements jsonb not null default '[]'::jsonb,  -- string[] applied this run
  result jsonb not null,                           -- HouseSearchResult snapshot
  listing_count integer not null default 0,
  trigger text not null default 'manual',          -- 'manual' | 'refine' | 'auto'

  created_at timestamptz not null default now()
);

create index if not exists contact_house_search_runs_search_idx
  on public.contact_house_search_runs (search_id, created_at desc);

alter table public.contact_house_searches enable row level security;
alter table public.contact_house_search_runs enable row level security;
