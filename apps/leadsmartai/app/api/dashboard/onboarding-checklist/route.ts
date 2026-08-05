import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { computeActivationChecklist } from "@/lib/activation/checklist";

export const runtime = "nodejs";

/**
 * GET /api/dashboard/onboarding-checklist
 *
 * The activation checklist (real "am I set up?" signals) for the Max welcome
 * page, without the LLM turn the /boss/onboarding chat endpoint does. Used to
 * check off setup steps the agent has already completed.
 */
export async function GET() {
  try {
    const { agentId, userId } = await getCurrentAgentContext();
    const checklist = await computeActivationChecklist(agentId, userId);
    return NextResponse.json({ ok: true, checklist });
  } catch {
    return NextResponse.json({ ok: false, checklist: null });
  }
}
