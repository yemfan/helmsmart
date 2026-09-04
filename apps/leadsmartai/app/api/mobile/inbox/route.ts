import { NextResponse } from "next/server";
import { requireMobileAgent } from "@/lib/mobile/auth";
import { mobileAppVersion, versionAtLeast } from "@/lib/mobile/appVersion";
import { getMobileInbox } from "@/lib/mobile/inbox";

export const runtime = "nodejs";

/** First app build whose inbox row can label a call as a call. */
const CALL_THREADS_MIN_APP_VERSION = "1.7.0";

export async function GET(req: Request) {
  const auth = await requireMobileAgent(req);
  if (auth.ok === false) return auth.response;

  try {
    // Calls joined the web Conversations view in #1490 and the app gained a
    // row for them in the same change, but a build older than 1.7.0 still
    // switches on sms/email and would label every call "Email". Those builds
    // keep the payload they were built against; newer ones get the calls.
    const includeCalls = versionAtLeast(mobileAppVersion(req), CALL_THREADS_MIN_APP_VERSION);
    const threads = await getMobileInbox(auth.ctx.agentId, { includeCalls });
    return NextResponse.json({
      ok: true,
      success: true,
      threads,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    console.error("GET /api/mobile/inbox", e);
    return NextResponse.json({ ok: false, success: false, error: msg }, { status: 500 });
  }
}
