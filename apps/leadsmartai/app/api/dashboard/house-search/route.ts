import { NextResponse } from "next/server";

import { generateHouseSearch } from "@/lib/house-search/aiHouseSearch";
import { getCurrentAgentContext } from "@/lib/dashboardService";

export const runtime = "nodejs";
// Web-search + multiple tool rounds can run long; give it room.
export const maxDuration = 300;

/**
 * POST /api/dashboard/house-search
 *
 * Body: { query: string, refinements?: string[] }
 * Runs the natural-language brief through Claude + live web search and
 * returns real matching listings + suggested refinements.
 */
export async function POST(req: Request) {
  try {
    // Gate on an authenticated agent (also surfaces a clean 401 in the UI).
    await getCurrentAgentContext();

    const body = (await req.json().catch(() => ({}))) as {
      query?: unknown;
      refinements?: unknown;
    };
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query) {
      return NextResponse.json({ ok: false, error: "Describe what the buyer is looking for." }, { status: 400 });
    }
    const refinements = Array.isArray(body.refinements)
      ? body.refinements.filter((r): r is string => typeof r === "string")
      : [];

    const res = await generateHouseSearch(query, refinements);
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: res.status });
    }
    return NextResponse.json({ ok: true, result: res.result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("house-search:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
