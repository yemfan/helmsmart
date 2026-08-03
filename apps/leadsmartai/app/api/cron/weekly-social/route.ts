import { NextResponse } from "next/server";

import { runDueWeeklySlots } from "@/lib/social/weeklySchedule";

export const runtime = "nodejs";
// Topic research (web_search) can take a while per due slot; give it room.
export const maxDuration = 300;

/**
 * Vercel cron: fires due weekly-social slots. Every 15 min (see vercel.json).
 * Each due slot researches its topic + writes a post and enqueues it into
 * scheduled_posts; the publish-scheduled cron then delivers it.
 */
function authorize(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    if (process.env.NODE_ENV !== "production") return true;
    return false;
  }
  return (req.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorize(req)) return new NextResponse("Unauthorized", { status: 401 });
  try {
    const result = await runDueWeeklySlots();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    console.error("[cron/weekly-social]", e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
