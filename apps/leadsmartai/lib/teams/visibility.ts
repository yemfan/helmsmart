import { PLAN_CATALOG } from "@/lib/entitlements/planCatalog";
import type { AgentPlan } from "@/lib/entitlements/types";

/**
 * Who sees the brokerage portal.
 *
 * Running a team is a Signature feature (and the contract Team plan's):
 * the plan catalog's `teamAccess` decides which plans may own one, so this
 * reads it rather than keeping a second list. Membership is separate. An
 * agent in a Signature broker's office is on their own plan, whatever it
 * is, and still needs their team's billboard, office board and license
 * page, so a member sees the Team row regardless of plan.
 *
 * Server-side only by use (it pulls the plan catalog); the browser gets the
 * answer as a boolean and filters with navVisibility.ts.
 */

export function planRunsTeams(plan: string | null | undefined): boolean {
  if (!plan || !(plan in PLAN_CATALOG)) return false;
  return PLAN_CATALOG[plan as AgentPlan].teamAccess;
}

export function showTeamNav(input: { plan: string | null | undefined; isMember: boolean }): boolean {
  return input.isMember || planRunsTeams(input.plan);
}
