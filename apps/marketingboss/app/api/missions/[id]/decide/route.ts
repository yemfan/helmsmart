import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decideStep, advanceRun } from "@/lib/workforce/missions";

/**
 * POST /api/missions/[id]/decide — approve or reject a parked step, then let
 * Nina carry on. Approval marks the already-parked work as decided; it never
 * re-executes the tool, because re-running a send is how a post goes out twice.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { stepId?: unknown; decision?: unknown };
  const stepId = typeof body.stepId === "string" ? body.stepId : "";
  const decision = body.decision === "approved" || body.decision === "rejected" ? body.decision : null;
  if (!stepId || !decision) {
    return NextResponse.json({ error: "I need to know which step, and whether it's approved." }, { status: 400 });
  }

  const result = await decideStep(user.id, stepId, decision);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });

  // Resuming is best-effort: the decision is already recorded, and the cron
  // picks the run back up if this request can't finish it.
  let needsContinuation = false;
  if (result.runId) {
    try {
      const advanced = await advanceRun(result.runId, { softDeadlineMs: 230_000 });
      needsContinuation = advanced.needsContinuation;
    } catch {
      needsContinuation = true;
    }
  }

  return NextResponse.json({ ok: true, needsContinuation });
}
