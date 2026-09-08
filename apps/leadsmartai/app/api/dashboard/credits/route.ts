import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { ensureTrialCreditsAndBalance } from "@/lib/credits/trial";
import { getSpendableBalance } from "@/lib/credits/ledger";
import { getCurrentPlan } from "@/lib/credits/currentPlan";

export const runtime = "nodejs";

/** GET — the signed-in agent's credit balance + current plan (seeds trial credits once). */
export async function GET() {
  try {
    const { userId } = await getCurrentAgentContext();
    const [own, plan] = await Promise.all([
      ensureTrialCreditsAndBalance(String(userId)),
      // Never let a Stripe hiccup break the balance read.
      getCurrentPlan(String(userId)).catch(() => null),
    ]);
    // On pooled credits the number that matters is the team owner's.
    const spendable = await getSpendableBalance(String(userId)).catch(() => ({ credits: own, pooled: false, teamName: null }));
    return NextResponse.json({ ok: true, credits: spendable.credits, ownCredits: own, pooled: spendable.pooled, teamName: spendable.teamName, plan });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
