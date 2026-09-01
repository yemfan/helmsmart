import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import {
  getActiveCrmSubscription,
  userHasCrmFeature,
  subscriptionRequiredResponse,
} from "@/lib/billing/subscriptionAccess";
import type { PlanFeature } from "@/lib/billing/plans";

type AgentCtx = Awaited<ReturnType<typeof getCurrentAgentContext>>;

/** 401 for an unauthenticated request — distinct from the 402 entitlement wall. */
function unauthenticatedResponse() {
  return NextResponse.json(
    { ok: false, error: "Sign in to continue.", code: "UNAUTHENTICATED" },
    { status: 401 },
  );
}

/**
 * Resolve the signed-in agent and assert a plan entitlement in one step, for
 * dashboard (cookie-auth) API routes. Returns the agent context on success, or
 * a ready-to-return response:
 *   - 401 UNAUTHENTICATED when there's no valid session (instead of a bare 500)
 *   - 402 SUBSCRIPTION_REQUIRED when the plan lacks `feature`
 *
 * Usage:
 *   const gate = await requireCrmFeature("bookkeeping");
 *   if (!gate.ok) return gate.response;
 *   const { agentId } = gate.ctx;   // only when the route needs it
 */
export async function requireCrmFeature(
  feature: PlanFeature,
): Promise<{ ok: true; ctx: AgentCtx } | { ok: false; response: NextResponse }> {
  let ctx: AgentCtx;
  try {
    ctx = await getCurrentAgentContext();
  } catch {
    return { ok: false, response: unauthenticatedResponse() };
  }
  if (!(await userHasCrmFeature(ctx.userId, feature))) {
    // Pass the plan they're actually on so the refusal can name it. Without
    // this every wall said "an active subscription is required", including to
    // subscribers whose plan just doesn't carry the feature.
    const sub = await getActiveCrmSubscription(ctx.userId).catch(() => null);
    return { ok: false, response: subscriptionRequiredResponse(feature, undefined, sub?.plan ?? null) };
  }
  return { ok: true, ctx };
}
