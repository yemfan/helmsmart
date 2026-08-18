import { NextRequest, NextResponse } from "next/server";
import { processPendingInstructions } from "@/lib/closeboss/instructions";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Every 5 minutes — the Boss Assistant reads pending instructions
 * from the Realtor, turns each into a routed task list (AI assistant
 * or Realtor review). See lib/closeboss/instructions.ts.
 *
 * Auth: Vercel's x-vercel-cron-signature OR Bearer/query CRON_SECRET.
 * Manual: curl "$URL/api/cron/boss-instructions?secret=$CRON_SECRET"
 */
function authorized(req: NextRequest): boolean {
  if (req.headers.get("x-vercel-cron-signature")) return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if ((req.headers.get("authorization") ?? "") === `Bearer ${secret}`) return true;
  return req.nextUrl.searchParams.get("secret") === secret;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const result = await processPendingInstructions();
  return NextResponse.json({ ok: true, ...result });
}
