-- Repair migration: backfill agent_oauth_tokens into version control.
--
-- This table already exists in production (it was applied out-of-band via the
-- Supabase MCP and never committed as a migration — the same schema-drift that
-- 20260609000000_repair_missing_tables.sql fixed for other tables). The Google
-- Calendar OAuth flow (app/api/auth/google-calendar/*) and lib/google-calendar/
-- sync.ts read and write it, so preview/branch/fresh databases were missing it
-- and broke Calendar connect there; the upcoming Gmail send workstream reuses
-- the same table, so it must be reproducible from migrations.
--
-- Idempotent by design: CREATE TABLE IF NOT EXISTS is a no-op on prod (table
-- present) and creates it on a clean DB. Column defaults / constraints / indexes
-- below mirror the live schema exactly (verified against prod).

create table if not exists public.agent_oauth_tokens (
  id            uuid primary key default gen_random_uuid(),
  agent_id      bigint not null references public.agents(id) on delete cascade,
  provider      text not null default 'google',
  access_token  text not null,
  refresh_token text,
  token_type    text default 'Bearer',
  expires_at    timestamptz,
  scope         text,
  calendar_id   text default 'primary',
  connected_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (agent_id, provider)
);

create index if not exists idx_agent_oauth_tokens_agent
  on public.agent_oauth_tokens (agent_id);

-- Access is service-role only (supabaseServer); RLS on with no policies denies
-- the anon/authenticated session clients, matching the project's RLS posture.
alter table public.agent_oauth_tokens enable row level security;
