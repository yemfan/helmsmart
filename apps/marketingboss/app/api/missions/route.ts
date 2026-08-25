import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createMission, advanceRun, listMissions } from "@/lib/workforce/missions";
import { missionsReady } from "@/lib/workforce/store";

/**
 * POST /api/missions — hand Nina a goal.
 *
 * Creates the mission, then drives the first run inline up to a soft deadline
 * comfortably inside maxDuration. Whatever is unfinished is picked up by
 * /api/cron/missions, so a long mission does not depend on this request
 * surviving.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Leaves room to persist and respond before the platform kills the function. */
const SOFT_DEADLINE_MS = 230_000;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  if (!(await missionsReady())) return NextResponse.json({ missions: [], ready: false });
  return NextResponse.json({ missions: await listMissions(user.id), ready: true });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  if (!(await missionsReady())) {
    return NextResponse.json(
      { error: "Missions aren't switched on for this account yet." },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { objective?: unknown; budgetCredits?: unknown };
  const objective = typeof body.objective === "string" ? body.objective.trim() : "";
  if (!objective) {
    return NextResponse.json({ error: "Tell me what you'd like to accomplish." }, { status: 400 });
  }

  const budget = Number(body.budgetCredits);
  const created = await createMission(user.id, objective, {
    budgetCredits: Number.isFinite(budget) && budget > 0 ? Math.round(budget) : null,
  });

  // The two intake gates answer with what the owner should do next, not with a
  // generic failure — `needs` lets the UI deep-link them straight there.
  if (!created.ok) {
    return NextResponse.json({ error: created.error, needs: created.needs }, { status: 409 });
  }

  // Kick the first run. A failure here is not a failed mission — the cron will
  // pick it up — so the response still points at the mission page.
  let needsContinuation = false;
  try {
    const result = await advanceRun(created.runId, { softDeadlineMs: SOFT_DEADLINE_MS });
    needsContinuation = result.needsContinuation;
  } catch (e) {
    console.warn("[missions] first run failed to advance:", e instanceof Error ? e.message : e);
    needsContinuation = true;
  }

  return NextResponse.json({ missionId: created.missionId, runId: created.runId, needsContinuation });
}
