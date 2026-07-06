import { NextResponse } from "next/server";
import { generateAiCma, isValuationFailure } from "@repo/valuation/server";
import { getUserFromRequest } from "@/lib/authFromRequest";
import { forwardGeocodeAddress } from "@/lib/homeValue/forwardGeocodeAddress";
import { normalizeHomeValueEstimateRequestBody } from "@/lib/homeValue/normalizeEstimateRequestBody";

export const runtime = "nodejs";
// Claude + web_search over real comparable sales runs ~15-40s.
export const maxDuration = 60;

function addressLineForGeocode(
  address: string,
  city: string | null | undefined,
  state: string | null | undefined,
  zip: string | null | undefined
) {
  return [address, city, state, zip]
    .filter((x) => x != null && String(x).trim())
    .map((x) => String(x).trim())
    .join(", ");
}

/** Map the AI valuation confidence score (0–95) to a coarse label. */
function confidenceLabel(score: number): "low" | "medium" | "high" {
  if (score >= 75) return "high";
  if (score >= 50) return "medium";
  return "low";
}

/** Coerce to a positive number, else undefined. */
function posNum(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Map a free-text property type to the funnel UI enum. */
function toUiPropertyType(
  t: string | null | undefined
): "single_family" | "condo" | "townhome" | "multi_family" | undefined {
  if (!t || !String(t).trim()) return undefined;
  const x = String(t).toLowerCase();
  if (/condo|apartment|coop/.test(x)) return "condo";
  if (/town|row/.test(x)) return "townhome";
  if (/multi|duplex|triplex|fourplex/.test(x)) return "multi_family";
  return "single_family";
}

/**
 * POST /api/home-value/estimate — AI-grounded home value estimate.
 *
 * Replaces the former Rentcast + warehouse comp pipeline with the shared
 * `@repo/valuation` engine (Claude + web_search over real comparable sales).
 * The response envelope is unchanged so the funnel / estimate hook keep working:
 * `{ success, sessionId, property, estimate, supportingData, adjustments,
 *    comps, recommendations, provider }`.
 *
 * Subject + comp coordinates are still resolved via `forwardGeocodeAddress`
 * (Mapbox/Google) so the map continues to render.
 */
export async function POST(req: Request) {
  try {
    const raw = await req.json().catch(() => ({}));
    const body = normalizeHomeValueEstimateRequestBody(raw);
    // Auth is not required for a public estimate, but resolve it best-effort
    // (parity with the previous pipeline, which threaded userId through).
    await getUserFromRequest(req).catch(() => null);

    const address = String(body.address ?? "").trim();
    if (!address) {
      return NextResponse.json(
        { success: false, error: "Missing property address" },
        { status: 400 }
      );
    }

    const sessionId = body.session_id ?? "";

    const result = await generateAiCma({
      address,
      beds: posNum(body.beds),
      baths: posNum(body.baths),
      sqft: posNum(body.sqft),
      yearBuilt: posNum(body.yearBuilt),
      condition: typeof body.condition === "string" ? body.condition : undefined,
    });

    // Use the type-guard (not `!result.ok`) so this narrows under strict:false.
    if (isValuationFailure(result)) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status }
      );
    }

    const snapshot = result.snapshot;
    const subject = snapshot.subject;
    const valuation = snapshot.valuation;

    // Resolve subject lat/lng: prefer client-supplied coords, else geocode.
    let lat = body.lat != null ? Number(body.lat) : NaN;
    let lng = body.lng != null ? Number(body.lng) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      const query = addressLineForGeocode(address, body.city, body.state, body.zip);
      const geo = query ? await forwardGeocodeAddress(query) : null;
      if (geo) {
        lat = geo.lat;
        lng = geo.lng;
      }
    }

    // Map snapshot comps → EstimateComp shape the client consumes.
    const compsMapped = (snapshot.comps ?? []).map((c, idx) => ({
      id: `ai-${idx}`,
      address: c.address,
      soldPrice: c.price,
      soldDate: c.soldDate,
      pricePerSqft: c.pricePerSqft,
      sqft: c.sqft,
      beds: c.beds ?? undefined,
      baths: c.baths ?? undefined,
      distanceMiles: Number(c.distanceMiles ?? 0),
      similarityScore: 0,
      matchReasons: [] as string[],
      lat: undefined as number | undefined,
      lng: undefined as number | undefined,
    }));

    /**
     * Geocode up to 10 comps so they show on the map. The AI snapshot doesn't
     * carry coordinates, so batch-geocode with the subject's city/state/zip as
     * context for a better hit rate.
     */
    if (compsMapped.length > 0) {
      const geocodeResults = await Promise.allSettled(
        compsMapped.slice(0, 10).map(async (comp) => {
          const query = addressLineForGeocode(comp.address, body.city, body.state, body.zip);
          const geo = query ? await forwardGeocodeAddress(query) : null;
          if (geo) {
            comp.lat = geo.lat;
            comp.lng = geo.lng;
          }
        })
      );
      const geocoded = geocodeResults.filter((r) => r.status === "fulfilled").length;
      console.log(`[home-value-estimate] Geocoded ${geocoded}/${Math.min(compsMapped.length, 10)} comps`);
    }

    const confidenceScore =
      valuation.confidenceScore != null && Number.isFinite(Number(valuation.confidenceScore))
        ? Number(valuation.confidenceScore)
        : 0;

    return NextResponse.json({
      success: true,
      sessionId,
      property: {
        fullAddress: address,
        city: body.city ?? undefined,
        state: body.state ?? undefined,
        zip: body.zip ?? undefined,
        lat: Number.isFinite(lat) ? lat : 0,
        lng: Number.isFinite(lng) ? lng : 0,
        propertyType:
          toUiPropertyType(subject.propertyType) ??
          toUiPropertyType(body.propertyType) ??
          undefined,
        beds: subject.beds ?? body.beds ?? undefined,
        baths: subject.baths ?? body.baths ?? undefined,
        sqft: subject.sqft ?? body.sqft ?? undefined,
        yearBuilt: subject.yearBuilt ?? body.yearBuilt ?? undefined,
        lotSize: subject.lotSizeSqft ?? body.lotSqft ?? undefined,
      },
      estimate: {
        value: valuation.estimatedValue,
        rangeLow: valuation.low,
        rangeHigh: valuation.high,
        confidence: confidenceLabel(confidenceScore),
        confidenceScore,
        summary: snapshot.summary ?? "",
      },
      supportingData: {
        medianPpsf: valuation.avgPricePerSqft,
        weightedPpsf: valuation.avgPricePerSqft,
        compCount: compsMapped.length,
      },
      adjustments: {},
      comps: compsMapped,
      recommendations: {
        type: "seller",
        actions: [] as string[],
      },
      provider: {
        source: "ai_web_search",
        cached: false,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    if (msg === "address is required" || msg === "Invalid JSON body") {
      return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }
    console.error("home-value-estimate", e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
