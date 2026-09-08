import { NextResponse } from "next/server";

import { getDashboardAgentContext } from "@/lib/contact-intake/dashboardAgentContext";
import { listMetaPixelsForAgent } from "@/lib/leads-gen/meta-pixels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/hub/meta-pixels
 * The Meta Pixels on the agent's ad accounts, via their Facebook connection,
 * so the Settings card can fill the Pixel id with a click. Answers with a
 * reason, not an error, when there is no connection or no ads permission:
 * both are things the agent can fix from the connect page.
 */
export async function GET() {
  try {
    const auth = await getDashboardAgentContext();
    if (auth.ok === false) return auth.response;
    const result = await listMetaPixelsForAgent(auth.agentId);
    return NextResponse.json(result.ok ? { ok: true, pixels: result.pixels } : { ok: true, pixels: [], reason: result.reason });
  } catch (e) {
    console.error("[hub/meta-pixels]", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "read_failed" }, { status: 500 });
  }
}
