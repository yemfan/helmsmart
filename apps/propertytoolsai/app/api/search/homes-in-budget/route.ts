import { NextResponse } from "next/server";

import { generateHouseSearch } from "@repo/valuation/server";

import { paramsToBrief } from "@/lib/listings/brief";
import { houseListingToResult } from "@/lib/listings/aiListing";
import {
  getPublicHouseSearchUsage,
  incrementPublicHouseSearchUsage,
} from "@/lib/publicHouseSearchUsage";

// Web search + multiple Opus tool rounds run long (~30-60s); give it room.
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/search/homes-in-budget  (PUBLIC — no auth required)
 *
 * The consumer "Homes in Your Budget" search, now AI-backed by the shared
 * `generateHouseSearch` engine (Claude + live web search) instead of RentCast.
 *
 * Accepts the existing structured params
 * (maxPrice/minPrice/zip/city/state/propertyType/beds/baths) AND an optional
 * free-text `q`. When `q` is present it's used verbatim as the brief; otherwise
 * the params are translated to a natural-language brief. Results are mapped
 * back onto the legacy `ListingResult` shape so existing UI keeps working; each
 * result carries a `listingUrl` pointing at the external source.
 *
 * Response shape is unchanged: { success, results, criteria }. A 3-tier funnel
 * rate limit (anon 1/day, signed-in free 5/day, paid uncapped) guards the
 * Opus/web-search spend; on limit it returns 429 with a `reason`.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const q = (searchParams.get("q") || "").trim();
    const maxPrice = Number(searchParams.get("maxPrice") || 0);
    const minPrice = Number(searchParams.get("minPrice") || 0);
    const zip = searchParams.get("zip") || "";
    const city = searchParams.get("city") || "";
    const state = searchParams.get("state") || "CA";
    const propertyTypeRaw = searchParams.get("propertyType") || "";
    const beds = Number(searchParams.get("beds") || 0);
    const baths = Number(searchParams.get("baths") || 0);

    const criteria = {
      maxPrice,
      minPrice,
      zip,
      city,
      state,
      propertyType: propertyTypeRaw,
      beds,
      baths,
    };

    // Build the natural-language brief: explicit free-text wins, otherwise
    // translate the structured params. If neither yields a real search signal,
    // don't burn an Opus run on an unbounded query.
    const brief =
      q ||
      paramsToBrief({
        city,
        state,
        zip,
        priceMin: minPrice || null,
        priceMax: maxPrice || null,
        bedsMin: beds || null,
        bathsMin: baths || null,
        propertyType: propertyTypeRaw || null,
      });

    if (!brief) {
      return NextResponse.json({ success: true, results: [], criteria });
    }

    // Each run costs real Opus tokens + web searches. Gate with the 3-tier
    // funnel (anon 1/day, signed-in free 5/day, paid uncapped).
    const usage = await getPublicHouseSearchUsage(req);
    if (usage.reached) {
      const error =
        usage.reason === "free_limit"
          ? `You've hit today's ${usage.limit} free searches. Upgrade to a paid plan to keep searching.`
          : "You've used today's free search. Create a free account to keep searching, or try again tomorrow.";
      return NextResponse.json(
        { success: false, reason: usage.reason, error, usage, criteria },
        { status: 429 },
      );
    }

    const res = await generateHouseSearch(brief);
    // NB: strict:false — `!res.ok` doesn't narrow the union here, so branch on
    // the `ok === true` case explicitly to access `res.result` / `res.error`.
    if (res.ok !== true) {
      return NextResponse.json(
        { success: false, error: res.error, criteria },
        { status: res.status },
      );
    }

    const results = res.result.listings.map((l) =>
      houseListingToResult(l, { city, state, zip }),
    );

    // Count only successful runs (don't burn the allowance on failures).
    const after = await incrementPublicHouseSearchUsage(req);

    return NextResponse.json({
      success: true,
      provider: "ai_house_search",
      results,
      criteria,
      usage: after,
    });
  } catch (error) {
    console.error("homes in budget search error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to load homes in budget",
      },
      { status: 500 },
    );
  }
}
