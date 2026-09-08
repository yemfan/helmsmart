import type { TeamRole } from "./types";

/**
 * What each team role may do. One place, so a server action and a card in
 * the page cannot disagree about it.
 *
 *   owner    everything below, plus billing, removing members, changing roles
 *   manager  runs onboarding: invite, import a roster, resend, revoke,
 *            read the onboarding board, set the brokerage brand
 *   member   sees the team: roster, breakdown, performance
 */
export function canManageTeam(role: TeamRole | null | undefined): boolean {
  return role === "owner" || role === "manager";
}

export function canAdministerTeam(role: TeamRole | null | undefined): boolean {
  return role === "owner";
}

/** Roles an owner may assign. Ownership itself does not change hands here. */
export const ASSIGNABLE_ROLES: readonly TeamRole[] = ["manager", "member"];

export function isAssignableRole(v: unknown): v is "manager" | "member" {
  return v === "manager" || v === "member";
}
