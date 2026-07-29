import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cronAuth";
import { reapStalledBossRuns } from "@/lib/boss/runs/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Resuming a stalled run can span several model turns + tool calls.
export const maxDuration = 300;

/**
 * Boss v2 stall reaper (every 5 min): reconciles `boss_instructions` left in
 * `processing` when a chunked run's continuation hop was dropped or a run
 * reached a terminal state without reporting back, and re-drives runs that
 * stalled mid-flight. Auth mirrors the sibling crons (lib/cronAuth).
 */
export async function GET(req: NextRequest) {
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await reapStalledBossRuns();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    console.error("[boss-reap]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
