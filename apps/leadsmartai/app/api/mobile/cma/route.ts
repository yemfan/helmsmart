import { NextResponse } from "next/server";
import { requireMobileAgent } from "@/lib/mobile/auth";
import { getCmaUsage, incrementCmaUsage } from "@/lib/cmaUsage";
import { generateAiCma } from "@/lib/cma/aiCma";
import { isCredibleCmaValuation } from "@repo/valuation";

export const runtime = "nodejs";
/** Claude plus live web search. The web presentation route allows the same. */
export const maxDuration = 300;

/**
 * POST /api/mobile/cma
 *
 * Bearer-auth'd CMA for the app. Body: { address, sqft?, condition? }.
 *
 * THIS USED TO BE A DIFFERENT PRODUCT FROM THE WEB'S CMA. It required the
 * address to already exist in our own `properties` warehouse, then averaged
 * price/sqft over whatever `getComparables` returned. The web moved to the
 * AI engine (Claude + live web search, `@repo/valuation`) and mobile never
 * followed, so a real address the warehouse had never heard of — 19668
 * Three Oaks Ln, Walnut CA, say — came back 404 telling the agent to import
 * MLS. On a phone, with no MLS importer, that was a dead end for every
 * address outside the warehouse, which is nearly all of them.
 *
 * Now it calls the same engine the dashboard, Ask Max and the seller
 * presentation use, so one address yields one number everywhere.
 *
 * The daily quota still applies, and is still charged on SUCCESS only: an
 * agent should not spend a CMA on an address we failed to value.
 */
export async function POST(req: Request) {
  const auth = await requireMobileAgent(req);
  if (auth.ok === false) return auth.response;

  const preUsage = await getCmaUsage(req);
  if (preUsage.reached) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        error: "You've reached your daily CMA limit.",
        usage: preUsage,
        code: "cma_limit_reached",
      },
      { status: 402 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    address?: string;
    sqft?: number;
    condition?: string;
  };
  const address = body.address?.trim();
  if (!address) {
    return NextResponse.json(
      { ok: false, success: false, error: "Address is required.", code: "missing_address" },
      { status: 400 },
    );
  }

  const result = await generateAiCma({
    address,
    sqft: body.sqft ?? undefined,
    condition: body.condition ?? undefined,
  });

  if (!result.ok) {
    /*
     * The engine's own message, verbatim. It already explains the case that
     * matters here — too few real comparable sales to value the address
     * confidently — and says what to try (a fuller address). A generic
     * failure string would lose that.
     */
    return NextResponse.json(
      { ok: false, success: false, error: result.error, code: "valuation_failed" },
      { status: result.status },
    );
  }

  const snap = result.snapshot;

  /*
   * A failed AI run can still come back correctly shaped with zeros in it.
   * Shipping that renders a confident "$0" on a screen an agent may turn
   * toward a seller, so the same gate the web save path uses applies here.
   */
  if (!isCredibleCmaValuation(snap.valuation)) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        error:
          "We couldn't put a reliable number on that address. Try again, or add the city, state and ZIP.",
        code: "valuation_not_credible",
      },
      { status: 422 },
    );
  }

  const postUsage = await incrementCmaUsage(req);
  const v = snap.valuation;

  return NextResponse.json({
    ok: true,
    success: true,
    usage: postUsage,
    summary: snap.summary ?? "",
    subject: {
      address: snap.subject.address,
      beds: snap.subject.beds ?? 0,
      baths: snap.subject.baths ?? 0,
      sqft: snap.subject.sqft ?? body.sqft ?? 0,
      propertyType: snap.subject.propertyType ?? null,
      yearBuilt: snap.subject.yearBuilt ?? 0,
      condition: snap.subject.condition ?? body.condition ?? null,
    },
    comps: snap.comps,
    avgPricePerSqft: v.avgPricePerSqft,
    estimatedValue: v.estimatedValue,
    low: v.low,
    high: v.high,
    /*
     * Passed through as-is, null included. The engine omits strategies when
     * it has no basis for them, and inventing days-on-market to satisfy the
     * client's shape would sit made-up numbers beside real ones. The client
     * hides the section instead.
     */
    strategies: snap.strategies,
    /** An AI estimate: the disclaimer travels with it, and the app shows it. */
    disclaimer: snap.disclaimer ?? null,
    sources: snap.sources ?? [],
    confidenceScore: v.confidenceScore ?? null,
  });
}
