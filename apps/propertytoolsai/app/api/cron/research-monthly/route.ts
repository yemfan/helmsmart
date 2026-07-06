import { NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/seoOptimization/cronAuth";
import { publishResearchReport } from "@/lib/research/publish";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Monthly cron: publish the housing-market report (1st of the month).
 * GET /api/cron/research-monthly?secret=...
 */
export async function GET(req: Request) {
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return NextResponse.json(
      { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY not configured" },
      { status: 503 },
    );
  }

  try {
    const slug = await publishResearchReport("monthly_market");
    if (!slug) {
      return NextResponse.json({ ok: false, error: "Report generation failed" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, slug });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
