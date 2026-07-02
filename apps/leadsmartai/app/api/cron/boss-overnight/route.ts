import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cronAuth";
import { runOvernightForDueAgents } from "@/lib/boss/runs/overnight";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// One overnight run can span several model turns + tool calls.
export const maxDuration = 300;

/**
 * Boss v2 overnight cron (every 15 min): starts the nightly autonomous run
 * for opted-in agents whose local clock is in the 4am window.
 * Auth mirrors the sibling crons (lib/cronAuth).
 */
export async function GET(req: NextRequest) {
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runOvernightForDueAgents();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    console.error("[boss-overnight]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
