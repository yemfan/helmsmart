-- Saved Property Deep Reports — enables a shareable /deep-report/[id] link.
-- One row per generated report; the full report payload lives in `report`
-- jsonb (same approach as presentations/comparison_reports). agent_id is the
-- auth user id (uuid). Accessed via the service role (server routes +
-- public-by-id share page), so RLS is enabled with no policies — service role
-- bypasses RLS and no client reads/writes it directly.

create table if not exists public.deep_reports (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid,
  address text not null,
  property_use text not null,
  report jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists deep_reports_agent_id_idx on public.deep_reports (agent_id, created_at desc);

alter table public.deep_reports enable row level security;
