import { NextResponse } from "next/server";

import { verifyCronRequest } from "@/lib/cronAuth";
import { postNextBrandLinkedIn } from "@/lib/realtyboss/brand-social/run";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/brand-linkedin
 *
 * Auto-posts RealtyBoss's own marketing (lib/realtyboss/brand-social/posts.ts)
 * to the connected LinkedIn account, one post per run, in order — so the brand
 * feed fills itself on a Mon/Wed/Fri cadence. Fully gated: no-op until
 * BRAND_LINKEDIN_AGENT_ID is set and that agent has connected LinkedIn in-app.
 */
async function run(req: Request) {
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const result = await postNextBrandLinkedIn();
  return NextResponse.json({ ok: true, result });
}

export async function GET(req: Request) {
  return run(req);
}
export async function POST(req: Request) {
  return run(req);
}
