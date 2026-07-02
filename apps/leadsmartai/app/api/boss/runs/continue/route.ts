import { NextRequest, NextResponse } from "next/server";
import { continueBossRun } from "@/lib/boss/runs/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// One chunk of an agent loop — tools do live web search; give it headroom.
export const maxDuration = 300;

/**
 * Internal continuation hop for chunked Boss runs (HANDOFF_BOSS_V2 PR-3).
 * Secret-authed: only the engine (and ops) call this.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { runId?: unknown };
  const runId = typeof body.runId === "string" ? body.runId : "";
  if (!runId) return NextResponse.json({ ok: false, error: "runId required" }, { status: 400 });

  const status = await continueBossRun(runId);
  return NextResponse.json({ ok: true, status });
}
