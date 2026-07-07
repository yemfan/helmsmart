import { NextResponse } from "next/server";

import { getCurrentAgentContext } from "@/lib/dashboardService";
import {
  currentWeekOf,
  generateWeeklyRecommendations,
  listRecommendations,
  recommendationImageUrl,
} from "@/lib/social/recommend";

export const runtime = "nodejs";
// The recommender reads the digest + library and composes captions deterministically
// (no per-post AI), so it's fast — but keep headroom for the DB round-trips.
export const maxDuration = 60;

/**
 * POST /api/social/recommend — build (or return, if already built) THIS week's
 * social-post recommendations for the current agent, so they don't have to wait
 * for the Monday cron. Idempotent per (agent, week).
 *
 * Auth: getCurrentAgentContext throws when unauthenticated / no agent row.
 */
export async function POST() {
  try {
    const { agentId } = await getCurrentAgentContext();
    const weekOf = currentWeekOf();
    const { count } = await generateWeeklyRecommendations(String(agentId), weekOf);
    const rows = await listRecommendations(String(agentId), weekOf);
    // Attach the branded-image URL for the UI (thumbnail + preview modal): the
    // stored asset first, on-the-fly /api/social/card/[id] as a fallback.
    const recommendations = rows.map((r) => ({
      ...r,
      imageUrl: r.image_url ?? recommendationImageUrl(r.id),
    }));
    return NextResponse.json({ ok: true, count, weekOf, recommendations });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
