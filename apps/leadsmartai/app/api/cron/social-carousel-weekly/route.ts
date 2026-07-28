import { NextRequest, NextResponse } from "next/server";

import { verifyCronRequest } from "@/lib/cronAuth";
import { runWeeklyCarousels } from "@/lib/social/enqueueCarousels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Generates a top-up batch (AI) per brand agent when low, then a few DB writes.
export const maxDuration = 300;

/**
 * Weekly carousel auto-enqueue cron (see vercel.json).
 *
 * For each brand agent with a connected carousel-capable account: tops up the
 * unposted carousel pool, then enqueues one carousel via scheduleCarousel —
 * publishable ('auto' mode) or held for approval (otherwise). The
 * publish-scheduled cron then multi-image-publishes the 'scheduled' ones.
 *
 * Auth + service-role guard mirror the sibling social-weekly cron.
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
    const result = await runWeeklyCarousels();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[social-carousel-weekly]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 },
    );
  }
}
