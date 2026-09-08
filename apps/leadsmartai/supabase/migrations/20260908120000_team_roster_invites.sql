-- Brokerage onboarding, phase 1: invites that carry a name and phone, are
-- emailed by a mailer (not copied by hand), and a per-team seat cap a
-- brokerage contract can set above the plan's.
--
-- team_invites so far held an email and a hashed token; the owner copied the
-- accept link out of the page one agent at a time. A brokerage of 1,200 agents
-- pastes a roster instead, and a cron sends the invitations in batches.

alter table public.team_invites
  add column if not exists invited_name text,
  add column if not exists invited_phone text,
  add column if not exists source text not null default 'manual',
  add column if not exists email_sent_at timestamptz,
  add column if not exists email_attempts integer not null default 0,
  add column if not exists email_error text;

comment on column public.team_invites.source is 'manual (typed one at a time) or roster (bulk import).';
comment on column public.team_invites.email_sent_at is 'When the invitation email went out; null = still queued for the mailer.';

-- The mailer drains queued invitations oldest first.
create index if not exists idx_team_invites_mailer
  on public.team_invites (created_at)
  where email_sent_at is null and accepted_at is null;

-- A brokerage contract may allow more seats than the owner's plan lists.
-- Null = the plan's cap applies. Set by an admin, never by the page.
alter table public.teams
  add column if not exists seat_cap_override integer;

comment on column public.teams.seat_cap_override is 'Seats allowed for this team regardless of the plan cap (brokerage contracts). Null = plan cap.';
