import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMissionDetail, cancelMission } from "@/lib/workforce/missions";

/** GET a mission with its runs and steps; DELETE to cancel it. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const detail = await getMissionDetail(user.id, id);
  if (!detail) return NextResponse.json({ error: "That mission doesn't exist." }, { status: 404 });

  // The transcript never leaves the server — the owner sees decisions and
  // results, not the model's working (§20).
  return NextResponse.json({
    mission: detail.mission,
    steps: detail.steps.map((s) => ({
      id: s.id,
      worker: s.worker,
      tool: s.tool_name,
      status: s.status,
      approvalState: s.approval_state,
      summary: s.summary,
      artifactUrl: s.artifact_url,
      creditsSpent: s.credits_spent,
      createdAt: s.created_at,
    })),
    report: detail.runs.at(-1)?.report ?? null,
    creditsSpent: detail.mission.spent_credits,
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  await cancelMission(user.id, id);
  return NextResponse.json({ ok: true });
}
