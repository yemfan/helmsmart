import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { ensureTrialCreditsAndBalance } from "@/lib/credits/trial";

export const runtime = "nodejs";

/** GET — the signed-in agent's current credit balance (seeds trial credits once). */
export async function GET() {
  try {
    const { userId } = await getCurrentAgentContext();
    const credits = await ensureTrialCreditsAndBalance(String(userId));
    return NextResponse.json({ ok: true, credits });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
