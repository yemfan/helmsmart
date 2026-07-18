import { NextRequest, NextResponse } from "next/server";

import { verifyCronRequest } from "@/lib/cronAuth";
import { runWeeklyRecommendationsForOptedInAgents } from "@/lib/social/recommend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Iterates every opted-in agent; each is a handful of cheap DB round-trips
// (no per-post AI), but give it room for many agents.
export const maxDuration = 300;

/**
 * Weekly social-recommendations cron (Mondays 14:00 UTC — see vercel.json).
 *
 * Builds the week's social-post drafts for every agent that has opted in by
 * setting a boss_autopilot_settings row for (marketing_assistant, social). Both
 * 'auto' and 'ask' agents are processed: 'auto' fills the queue as 'approved',
 * 'ask' leaves 'suggested' drafts waiting for the agent to approve on Monday.
 *
 * Idempotent per (agent, week). Auth mirrors the sibling crons (lib/cronAuth)
 * and we no-op without the service-role key since the library + digest tables
 * are RLS-deny.
 */
export async function GET(req: NextRequest) {
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return NextResponse.json(
      { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY not configured" },
      { status: 500 },
    );
  }

  try {
    const result = await runWeeklyRecommendationsForOptedInAgents();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[social-weekly]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 },
    );
  }
}
