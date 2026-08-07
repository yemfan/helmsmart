import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { getCreditBalance } from "@/lib/credits/ledger";

export const runtime = "nodejs";

/** GET — the signed-in agent's current credit balance. */
export async function GET() {
  try {
    const { userId } = await getCurrentAgentContext();
    const credits = await getCreditBalance(String(userId));
    return NextResponse.json({ ok: true, credits });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
