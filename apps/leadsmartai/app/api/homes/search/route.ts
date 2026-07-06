import { NextResponse } from "next/server";

import { generateHouseSearch } from "@/lib/house-search/aiHouseSearch";
import {
  getPublicHouseSearchUsage,
  incrementPublicHouseSearchUsage,
} from "@/lib/house-search/publicUsage";

export const runtime = "nodejs";
// Web-search + multiple Opus tool rounds run long (~30-60s); give it room.
export const maxDuration = 300;

/**
 * POST /api/homes/search  (PUBLIC — no auth)
 *
 * Body: { query: string, refinements?: string[] }
 * The public /homes browse surface: runs a natural-language brief through
 * Claude + live web search and returns real matching listings + suggested
 * refinements. Every visitor is anonymous, so we enforce a small daily
 * rate limit keyed by IP+UA (see lib/house-search/publicUsage.ts).
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      query?: unknown;
      refinements?: unknown;
    };
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query) {
      return NextResponse.json(
        { ok: false, error: "Describe the home you're looking for." },
        { status: 400 },
      );
    }
    const refinements = Array.isArray(body.refinements)
      ? body.refinements.filter((r): r is string => typeof r === "string")
      : [];

    // Each run costs real Opus tokens + web searches. 3-tier funnel: anonymous
    // 1/day, signed-in-free 5/day, unlimited plans uncapped
    // (see lib/house-search/publicUsage.ts).
    const usage = await getPublicHouseSearchUsage(req);
    if (usage.reached) {
      const error =
        usage.reason === "free_limit"
          ? `You've hit today's ${usage.limit} free searches. Upgrade to an unlimited plan to keep searching.`
          : "You've used today's free search. Create a free account to keep searching, or try again tomorrow.";
      return NextResponse.json(
        { ok: false, reason: usage.reason, error, usage },
        { status: 429 },
      );
    }

    const res = await generateHouseSearch(query, refinements);
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: res.status });
    }

    // Count only successful runs (don't burn the allowance on failures).
    const after = await incrementPublicHouseSearchUsage(req);
    return NextResponse.json({ ok: true, result: res.result, usage: after });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("homes/search:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
