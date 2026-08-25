import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { advanceRun } from "@/lib/workforce/missions";
import { missionsReady } from "@/lib/workforce/store";
import { isJobEnabled } from "@/lib/cron/switches";

/**
 * Mission continuation — its own cron path, deliberately.
 *
 * /api/cron/run already packs seven phases into a single fifteen-minute tick,
 * and is tight enough that discovery gets skipped whenever the viral refresh
 * fires. Adding mission continuation there would make both worse. This endpoint
 * does one job: pick up runs that yielded on their soft deadline, and reap runs
 * that died mid-flight.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** One run per tick: a continuation can legitimately use the whole budget. */
const CONTINUE_LIMIT = 1;
/** A run still "running" after this long lost its invocation. */
const STUCK_AFTER_MS = 15 * 60 * 1000;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Cron is not configured." }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!(await isJobEnabled("cron_missions"))) {
    return NextResponse.json({ ok: true, skipped: "disabled" });
  }
  if (!(await missionsReady())) return NextResponse.json({ ok: true, skipped: "missions tables not migrated yet" });

  const admin = createAdminClient();
  const now = Date.now();

  // Reap first: a run whose invocation died would otherwise block its mission
  // forever, and the owner would just see "running" with nothing happening.
  const stuckBefore = new Date(now - STUCK_AFTER_MS).toISOString();
  const { data: stuck } = await admin
    .from("agent_runs")
    .select("id, mission_id")
    .eq("status", "running")
    .lt("started_at", stuckBefore)
    .limit(5);

  let reaped = 0;
  for (const r of (stuck as { id: string; mission_id: string | null }[]) ?? []) {
    // Hand it back to "planning" rather than failing it: all the state is in the
    // transcript, so the next tick can genuinely continue where it stopped.
    await admin.from("agent_runs").update({ status: "planning" }).eq("id", r.id);
    reaped++;
  }

  const { data: pending } = await admin
    .from("agent_runs")
    .select("id")
    .in("status", ["planning", "running"])
    .order("started_at", { ascending: true })
    .limit(CONTINUE_LIMIT);

  let advanced = 0;
  let stillRunning = 0;
  for (const r of (pending as { id: string }[]) ?? []) {
    try {
      const result = await advanceRun(r.id, { softDeadlineMs: 230_000 });
      advanced++;
      if (result.needsContinuation) stillRunning++;
    } catch (e) {
      console.warn("[cron/missions] run failed to advance:", e instanceof Error ? e.message : e);
    }
  }

  return NextResponse.json({ ok: true, advanced, stillRunning, reaped, at: new Date(now).toISOString() });
}
