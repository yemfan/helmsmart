-- Tell people when they are added to a team, with a link to it.
--
-- A membership can be created three ways: accepting an invitation, the owner
-- row the teams_add_owner_membership trigger writes, and a direct add (an
-- admin putting known agents on a brokerage's team). Only the first ever
-- told the person anything, and only because they were the one clicking.
-- Each membership now carries whether its welcome email went out; the
-- team-member-welcome cron sends the ones that have not.
--
-- Owners are not emailed (they created the team). Every membership that
-- existed before this feature is marked as sent so nobody is emailed about
-- a team they joined long ago; the cutoff is the moment the Pinnacle Real
-- Estate Group team was created (2026-09-11 15:40 UTC), whose two members
-- were added directly without an email and are the reason for this change.

alter table public.team_memberships
  add column if not exists welcome_email_sent_at timestamptz,
  add column if not exists welcome_email_attempts integer not null default 0,
  add column if not exists welcome_email_error text;

comment on column public.team_memberships.welcome_email_sent_at is 'When the "you are on this team" email went out; null = queued for the team-member-welcome cron. Owners are never queued.';

update public.team_memberships
   set welcome_email_sent_at = coalesce(created_at, now())
 where welcome_email_sent_at is null
   and (role = 'owner' or created_at < '2026-09-11 15:40:00+00');

create index if not exists idx_team_memberships_welcome_queue
  on public.team_memberships (created_at)
  where welcome_email_sent_at is null;
