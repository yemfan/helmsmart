import { NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/seoOptimization/cronAuth";
import { ingestMarketWarehouse } from "@/lib/research/warehouse/ingest";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Monthly cron: ingest the market-metrics warehouse from FRED / Zillow / Redfin.
 * Also usable as an admin trigger. GET /api/cron/warehouse-ingest?secret=...
 *
 * Best-effort per source: the summary lists per-source rows/geos upserted and
 * any errors. Returns 200 even on partial failure so a single bad source does
 * not fail the whole cron; inspect `sources[].errors` for detail.
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
    const summary = await ingestMarketWarehouse();
    return NextResponse.json({ ok: true, summary });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
