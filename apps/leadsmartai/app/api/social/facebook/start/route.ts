import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Legacy Meta connect entry point — redirects to the modern flow.
 *
 * Nothing in the UI links here anymore (the old settings panel that did was
 * removed), but a stray bookmark or the mobile app could still hit it. The old
 * implementation set a different state cookie (`fb_oauth_state`) and used a
 * Pages path that never captured Instagram or portfolio-owned Pages, so instead
 * of kicking off that dead flow we forward to the Instagram-aware
 * /api/leads-gen/connect/meta/start.
 */
export function GET(req: Request) {
  return NextResponse.redirect(
    new URL("/api/leads-gen/connect/meta/start", req.url),
    { status: 307 },
  );
}
