import { NextResponse } from "next/server";

import { getCurrentAgentContext } from "@/lib/dashboardService";
import { getSocialMode, setSocialMode } from "@/lib/social/recommend";

export const runtime = "nodejs";

/**
 * GET  /api/social/mode — the current agent's social autopilot mode.
 * POST /api/social/mode { mode: 'ask' | 'auto' } — set it (upserts
 *   boss_autopilot_settings for (marketing_assistant, social)).
 *
 * 'ask'  → new weekly recommendations stay 'suggested' (agent approves each).
 * 'auto' → new weekly recommendations are auto-'approved' (queue auto-fills).
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
    const mode = body.mode === "auto" ? "auto" : body.mode === "ask" ? "ask" : null;
    if (!mode) {
      return NextResponse.json(
        { ok: false, error: "mode must be 'ask' or 'auto'" },
        { status: 400 },
      );
    }
    await setSocialMode(String(agentId), mode);
    return NextResponse.json({ ok: true, mode });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
