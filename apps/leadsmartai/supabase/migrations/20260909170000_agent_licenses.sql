-- The agent's real estate license, as the brokerage requires it at
-- onboarding: number, issuing state, and whether it has been verified —
-- by the ARELLO licensee web service when a token is configured, or by a
-- manager on the onboarding board. The number is mirrored into
-- leadsmart_users.license_number, which the hub, CMA and report footers
-- already read; this table adds the state and the verification.
-- Service-role only.

create table if not exists public.agent_licenses (
  agent_id bigint primary key references public.agents(id) on delete cascade,
  license_number text not null,
  state text not null,
  status text not null default 'format_ok'
    check (status in ('format_ok', 'verified', 'not_found', 'inactive', 'mismatch', 'unavailable')),
  verified_at timestamptz,
  verified_by text check (verified_by in ('arello', 'manager')),
  verified_by_agent_id bigint references public.agents(id) on delete set null,
  payload jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.agent_licenses is 'Agent license number + state, and its verification: format_ok (checked shape only), verified (ARELLO or a manager), not_found / inactive / mismatch (ARELLO said so), unavailable (no verification source for that state).';

alter table public.agent_licenses enable row level security;
