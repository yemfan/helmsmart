/**
 * GET /api/cron/social/generate
 * Weekly: for every org with social autopilot enabled, Emily generates posts
 * ABOUT the business and queues them into `social_posts`. In 'auto' mode they're
 * scheduled at the chosen times (the 15-minute publish cron then sends them); in
 * 'review' mode they land as drafts for a human to schedule.
 *
 * Idempotent per (org, week) via org_social_autopilot.last_generated_week, so a
 * re-run — or Vercel firing the cron twice — never double-posts.
 *
 * Inline Bearer CRON_SECRET auth (matching the other cron routes).
 */
import { NextResponse } from "next/server";
import { runWeeklyAutopilot } from "@/lib/social-autopilot";

export const dynamic = "force-dynamic";
// Generation is one Claude call per post per org; budget generously.
export const maxDuration = 300;

export async function GET(request: Request) {
  const CRON_SECRET = process.env.CRON_SECRET;
  const auth = request.headers.get("Authorization");
  if (!auth || !CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runWeeklyAutopilot();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[cron/social/generate]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "generation failed" },
      { status: 500 },
    );
  }
}
