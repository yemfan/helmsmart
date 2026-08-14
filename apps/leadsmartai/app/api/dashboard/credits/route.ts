import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { ensureTrialCreditsAndBalance } from "@/lib/credits/trial";
import { getCurrentPlan } from "@/lib/credits/currentPlan";

export const runtime = "nodejs";

/** GET — the signed-in agent's credit balance + current plan (seeds trial credits once). */
export async function GET() {
  try {
    const { userId } = await getCurrentAgentContext();
    const [credits, plan] = await Promise.all([
      ensureTrialCreditsAndBalance(String(userId)),
      // Never let a Stripe hiccup break the balance read.
      getCurrentPlan(String(userId)).catch(() => null),
    ]);
    return NextResponse.json({ ok: true, credits, plan });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
