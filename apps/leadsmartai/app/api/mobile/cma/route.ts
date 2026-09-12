import { NextResponse } from "next/server";
import { requireMobileAgent } from "@/lib/mobile/auth";
import { getCmaUsage, incrementCmaUsage } from "@/lib/cmaUsage";
import { getPropertyByAddress, getComparables } from "@/lib/propertyService";

export const runtime = "nodejs";

/**
 * POST /api/mobile/cma
 *
 * Bearer-auth wrapper around the smart-CMA generation flow. Body:
 *   { address: string, sqft?: number, condition?: string }
 *
 * Mirrors the computation in /api/smart-cma but skips the
 * marketplace-session telemetry + the lead-event scoring (those
 * are web-flow specific). Daily CMA quota still applies via
 * getCmaUsage / incrementCmaUsage so mobile generations count
 * against the same allotment as desktop.
 *
 * The computation is duplicated here rather than extracted to a
 * shared helper for now — keeps the change isolated and avoids
 * regressing the web route during the mobile port. Refactor target
 * is `lib/cma/service.ts` once the mobile flow ships and we can
 * compare outputs side-by-side.
 */
export async function POST(req: Request) {
  const auth = await requireMobileAgent(req);
  if (auth.ok === false) return auth.response;

  // Daily quota gate. Mirrors the web flow. The usage helper takes
  // the request directly because it pulls user_id / role from auth.
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

  const subject = await getPropertyByAddress(address);
  if (!subject) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        /*
         * Was: "The agent may need to import MLS or use a Zillow/Redfin link
         * first." Written in the third person ABOUT the person reading it —
         * the agent is the reader, not a bystander — and it named a fix
         * ("use a link") that this screen offers no way to do. It now says
         * what happened, where the data comes from, and what the reader can
         * actually do next.
         */
        error:
          "We don't have sales data for that address yet. Import your MLS export on the CloseBoss dashboard, then try again.",
        code: "property_not_found",
      },
      { status: 404 },
    );
  }

  const compsResult = await getComparables(address, 10);
  const comps = (compsResult.comps ?? [])
    .filter(
      (c) =>
        c.sold_price != null &&
        c.comp_property?.sqft != null &&
        (c.comp_property?.sqft ?? 0) > 0,
    )
    .map((c) => {
      const price = Number(c.sold_price ?? 0);
      const sqft = Number(c.comp_property?.sqft ?? 0);
      const pricePerSqft = sqft > 0 ? price / sqft : 0;
      const soldDate = c.sold_date
        ? new Date(c.sold_date).toLocaleDateString()
        : "—";
      return {
        address: c.comp_property?.address ?? "—",
        price,
        sqft,
        beds: c.comp_property?.beds ?? null,
        baths: c.comp_property?.baths ?? null,
        distanceMiles: Number(c.distance_miles ?? 0),
        soldDate,
        propertyType: c.comp_property?.property_type ?? null,
        pricePerSqft,
      };
    });

  const subjectSqft = Number(body.sqft ?? subject.sqft ?? 1500) || 1500;
  const avgPricePerSqft =
    comps.length > 0
      ? comps.reduce((sum, c) => sum + c.pricePerSqft, 0) / comps.length
      : 0;
  const estimatedValue = avgPricePerSqft * subjectSqft;
  const low = estimatedValue * 0.92;
  const high = estimatedValue * 1.08;

  const now = Date.now();
  const daysSinceSale = comps
    .map((c) => {
      const t = new Date(c.soldDate).getTime();
      return Number.isFinite(t)
        ? Math.max(0, Math.floor((now - t) / (1000 * 60 * 60 * 24)))
        : null;
    })
    .filter((x): x is number => x != null);
  const avgDom =
    daysSinceSale.length > 0
      ? daysSinceSale.reduce((a, b) => a + b, 0) / daysSinceSale.length
      : 30;

  const strategies = {
    aggressive: estimatedValue * 0.95,
    market: estimatedValue,
    premium: estimatedValue * 1.03,
    daysOnMarket: {
      aggressive: Math.max(5, Math.round(avgDom * 0.8)),
      market: Math.max(5, Math.round(avgDom)),
      premium: Math.max(5, Math.round(avgDom * 1.2)),
    },
  };

  const subjectCondition = body.condition ?? "Average";
  const summary = comps.length
    ? `Based on ${comps.length} nearby comparable sold properties, the average price/sqft is about $${avgPricePerSqft.toFixed(
        0,
      )}. Using your subject's square footage, the estimated value is approximately $${Math.round(
        estimatedValue,
      ).toLocaleString()} with an expected range of $${Math.round(low).toLocaleString()} to $${Math.round(high).toLocaleString()}.`
    : "We couldn't find enough comparable sold history for this address yet. Import an MLS CSV (sold prices + sale dates) or try a Zillow/Redfin link to populate comparables.";

  // Increment usage AFTER successful computation. Mirrors the web
  // flow ordering. (Web increments before computation; for mobile
  // we charge on success only — feels fairer when MLS data is
  // missing and the agent gets a 404.)
  const postUsage = await incrementCmaUsage(req);

  return NextResponse.json({
    ok: true,
    success: true,
    usage: postUsage,
    summary,
    subject: {
      address: subject.address,
      beds: subject.beds ?? 0,
      baths: subject.baths ?? 0,
      sqft: subject.sqft ?? subjectSqft,
      propertyType: subject.property_type ?? null,
      yearBuilt: subject.year_built ?? 0,
      condition: subjectCondition,
    },
    comps,
    avgPricePerSqft,
    estimatedValue,
    low,
    high,
    strategies,
  });
}
