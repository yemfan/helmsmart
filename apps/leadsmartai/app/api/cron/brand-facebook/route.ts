import { NextResponse } from "next/server";

import { verifyCronRequest } from "@/lib/cronAuth";
import { postNextBrandFacebook } from "@/lib/realtyboss/brand-social/run";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/brand-facebook
 *
 * Auto-posts RealtyBoss's own marketing (lib/realtyboss/brand-social/posts.ts)
 * to the connected brand Facebook Page, one post per run, in order — the
 * Facebook twin of /api/cron/brand-linkedin. Fully gated: no-op until
 * BRAND_FACEBOOK_AGENT_ID is set and that agent has connected Meta in-app
 * (Settings → connect Facebook).
 *
 * Note: posting to our OWN Page as an app admin works at Meta's Standard
 * access — it does NOT require App Review. Review is only needed for agents
 * to connect their own Pages.
 */
async function run(req: Request) {
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const result = await postNextBrandFacebook();
  return NextResponse.json({ ok: true, result });
}

export async function GET(req: Request) {
  return run(req);
}
export async function POST(req: Request) {
  return run(req);
}
