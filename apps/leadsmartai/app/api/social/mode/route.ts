import { NextResponse } from "next/server";

import { getCurrentAgentContext } from "@/lib/dashboardService";
import { getSocialMode, isSocialMode, setSocialMode } from "@/lib/social/recommend";

export const runtime = "nodejs";

/**
 * GET  /api/social/mode — the current agent's social autopilot mode.
 * POST /api/social/mode { mode: 'ask' | 'review' | 'auto' } — set it (upserts
 *   boss_autopilot_settings for (marketing_assistant, social)).
 *
 * 'ask'    → drafts only; nothing is scheduled, the agent schedules by hand.
 * 'review' → the week is planned and queued at real times, then held for
 *            approval; nothing publishes until a human clears it.
 * 'auto'   → planned, queued and published with no gate.
 */
export async function GET() {
  try {
    const { agentId } = await getCurrentAgentContext();
    const mode = await getSocialMode(String(agentId));
    return NextResponse.json({ ok: true, mode });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const body = (await req.json().catch(() => ({}))) as { mode?: unknown };
    if (!isSocialMode(body.mode)) {
      return NextResponse.json(
        { ok: false, error: "mode must be 'ask', 'review' or 'auto'" },
        { status: 400 },
      );
    }
    const mode = body.mode;
    await setSocialMode(String(agentId), mode);
    return NextResponse.json({ ok: true, mode });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
