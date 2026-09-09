-- Referrals across the office. An agent hands a lead to a colleague on the
-- team for a referral fee: the contact is copied to the receiver (the
-- sender keeps their own row), the receiver accepts or declines, and when
-- the deal closes the receiver records the amount so the fee is on record
-- for both. contact_name is a snapshot so the list never joins contacts.
-- Service-role only.

create table if not exists public.team_referrals (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  from_agent_id bigint not null references public.agents(id) on delete cascade,
  to_agent_id bigint not null references public.agents(id) on delete cascade,
  contact_id uuid not null,
  copied_contact_id uuid,
  contact_name text not null,
  fee_pct numeric(5,2) not null default 25,
  note text,
  status text not null default 'open' check (status in ('open', 'accepted', 'declined', 'closed')),
  closed_amount numeric(14,2),
  responded_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.team_referrals is 'Leads handed between agents on a team for a fee: sender, receiver, the copied contact, fee %, status and the closed amount.';

create index if not exists idx_team_referrals_team on public.team_referrals (team_id, created_at desc);
create index if not exists idx_team_referrals_to on public.team_referrals (to_agent_id, status);
create index if not exists idx_team_referrals_from on public.team_referrals (from_agent_id, status);

alter table public.team_referrals enable row level security;
