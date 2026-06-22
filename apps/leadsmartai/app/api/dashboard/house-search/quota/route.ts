import { NextResponse } from "next/server";

import { getCurrentAgentContext } from "@/lib/dashboardService";
import { getHouseSearchQuota } from "@/lib/house-search/quota";

export const runtime = "nodejs";

/** GET /api/dashboard/house-search/quota — daily quota hint for the UI. */
export async function GET() {
  try {
    const { userId } = await getCurrentAgentContext();
    const quota = await getHouseSearchQuota(userId);
    return NextResponse.json({ ok: true, quota });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
