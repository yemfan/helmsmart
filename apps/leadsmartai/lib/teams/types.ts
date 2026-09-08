/**
 * Shared types for the team-accounts layer.
 */

export type TeamRole = "owner" | "manager" | "member";

export type Team = {
  id: string;
  name: string;
  ownerAgentId: string;
  createdAt: string;
  updatedAt: string;
};

export type TeamMembership = {
  teamId: string;
  agentId: string;
  role: TeamRole;
  createdAt: string;
};

export type TeamInvite = {
  id: string;
  teamId: string;
  invitedEmail: string;
  invitedByAgentId: string;
  expiresAt: string;
  acceptedAt: string | null;
  acceptedByAgentId: string | null;
  createdAt: string;
};

export type TeamRoster = {
  team: Team;
  members: TeamMembership[];
  pendingInvites: TeamInvite[];
};
