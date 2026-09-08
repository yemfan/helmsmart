-- A third team role: manager. An office manager or onboarding coordinator
-- who invites agents, imports rosters, resends invitations, reads the
-- onboarding board and sets the brokerage brand — without owning the team's
-- billing or being able to remove members or change roles. Owner keeps those.

alter table public.team_memberships drop constraint if exists team_memberships_role_check;
alter table public.team_memberships add constraint team_memberships_role_check
  check (role in ('owner', 'manager', 'member'));
