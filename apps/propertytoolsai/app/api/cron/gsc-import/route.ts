import { NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/seoOptimization/cronAuth";
import { ingestGscMetrics } from "@/lib/gsc/ingest";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Daily cron: pull the last ~5 days of Google Search Console metrics
 * (page-level and query×page) for each configured GSC_SITE_URLS property and
 * upsert into gsc_page_metrics / gsc_query_metrics.
 * GET /api/cron/gsc-import?secret=...  (or Authorization: Bearer <CRON_SECRET>)
 */
export async function GET(req: Request) {
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return NextResponse.json(
      { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY not configured" },
      { status: 503 }
    );
  }

  try {
    const results = await ingestGscMetrics();
    return NextResponse.json({ ok: true, results });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    // Surface the real cause in Vercel logs. A recurring failure here is
    // almost always `invalid_grant` — the GSC_OAUTH_REFRESH_TOKEN expired
    // (Google expires refresh tokens after 7 days while the OAuth app is in
    // "Testing" publishing status). Publish the app + re-mint the token
    // (scripts/mint-gsc-refresh-token.mjs).
    console.error("[gsc-import] ingest failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
