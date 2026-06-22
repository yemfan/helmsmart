import { NextResponse } from "next/server";

import { getCurrentAgentContext } from "@/lib/dashboardService";
import { getFeatureQuota } from "@/lib/quota/featureQuota";

export const runtime = "nodejs";

/** GET /api/dashboard/deep-report/quota — daily quota hint for the UI. */
export async function GET() {
  try {
    const { userId } = await getCurrentAgentContext();
    const quota = await getFeatureQuota(userId, "deep_report");
    return NextResponse.json({ ok: true, quota });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
