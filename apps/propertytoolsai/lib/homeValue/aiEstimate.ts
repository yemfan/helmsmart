import "server-only";

import { randomUUID } from "crypto";
import { generateAiCma, isValuationFailure } from "@repo/valuation/server";
import type { CmaSnapshot } from "@repo/valuation";
import type {
  HomeValueEstimateRequest,
  HomeValueEstimateResponse,
  NormalizedProperty,
  HomeValueEstimateOutput,
  ConfidenceOutput,
  ConfidenceLevel,
  ToolkitRecommendation,
  LikelyIntent,
  UserIntent,
} from "@/lib/homeValue/types";
import { extractUsZipFromAddress } from "@/lib/comps-ingestion/addressZip";
import { upsertHomeValueSession, insertToolEvent } from "@/lib/homeValue/funnelPersistence";
import { addressKey, setCachedAiEstimate } from "@/lib/homeValue/aiCache";

/**
 * AI Home Value Estimator — the Claude + web_search replacement for the
 * RentCast pipeline (runEstimate.ts). Calls the shared @repo/valuation engine,
 * maps the cited-comps snapshot into the existing HomeValueEstimateResponse
 * contract (so the UI is unchanged), then persists + caches.
 *
 * Caching + guest rate-limiting are enforced by the caller
 * (handleHomeValueEstimatePost) before this runs — a cache hit never reaches
 * here, so every call here is a real (billable) estimate.
 */

/** Carries an HTTP status so the route can map AI failures to the right code. */
export class AiEstimateError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AiEstimateError";
    this.status = status;
  }
}

export async function runAiHomeValueEstimate(
  body: HomeValueEstimateRequest,
  ctx: { userId: string | null },
): Promise<HomeValueEstimateResponse> {
  const address = (body.address ?? "").trim();
  if (!address) throw new AiEstimateError("address is required", 400);

  const result = await generateAiCma({
    address,
    beds: numOrUndef(body.beds),
    baths: numOrUndef(body.baths),
    sqft: numOrUndef(body.sqft),
    yearBuilt: numOrUndef(body.yearBuilt),
    condition: body.condition,
  });
  if (isValuationFailure(result)) {
    throw new AiEstimateError(result.error, result.status || 502);
  }

  const sessionId = (body.session_id ?? "").trim() || randomUUID();
  const response = buildResponse(result.snapshot, body, sessionId);

  // Persist (helpers swallow their own errors) + cache the full response.
  const appliedIntent = response.intentInference.applied;
  await upsertHomeValueSession({
    sessionId,
    userId: ctx.userId,
    addressRaw: address,
    merged: response.normalizedProperty,
    condition: body.condition ?? "average",
    renovation: body.renovation ?? "none",
    estimate: response.estimate,
    confidence: response.confidence,
    likelyIntent: appliedIntent,
  });
  await insertToolEvent({
    sessionId,
    userId: ctx.userId,
    toolName: "home_value_estimator",
    eventName: "ai_estimate_generated",
    metadata: { compCount: response.comps.pricedCount, source: "ai_web_search" },
  });
  await setCachedAiEstimate(addressKey(address), response);

  return response;
}

// ── mapping: CmaSnapshot → HomeValueEstimateResponse ─────────────

function buildResponse(
  snapshot: CmaSnapshot,
  body: HomeValueEstimateRequest,
  sessionId: string,
): HomeValueEstimateResponse {
  const subj = snapshot.subject;
  const val = snapshot.valuation;
  const { city, state, zip } = resolveCityStateZip(body, subj.address || body.address);

  const normalizedProperty: NormalizedProperty = {
    address: subj.address || body.address,
    city,
    state,
    zip,
    lat: body.lat ?? null,
    lng: body.lng ?? null,
    beds: orNull(subj.beds) ?? body.beds ?? null,
    baths: orNull(subj.baths) ?? body.baths ?? null,
    sqft: orNull(subj.sqft) ?? body.sqft ?? null,
    lotSqft: subj.lotSizeSqft ?? body.lotSqft ?? null,
    yearBuilt: orNull(subj.yearBuilt) ?? body.yearBuilt ?? null,
    propertyType: subj.propertyType ?? body.propertyType ?? null,
    missingFields: [],
  };
  for (const f of ["beds", "baths", "sqft", "yearBuilt"] as const) {
    if (normalizedProperty[f] == null) normalizedProperty.missingFields.push(f);
  }

  const estimate: HomeValueEstimateOutput = {
    point: val.estimatedValue,
    low: val.low,
    high: val.high,
    baselinePpsf: val.avgPricePerSqft,
    adjustments: [],
    summary:
      snapshot.summary ??
      `Estimated from ${snapshot.comps.length} recent comparable sale${
        snapshot.comps.length === 1 ? "" : "s"
      } found via live web search.`,
  };

  const score = val.confidenceScore ?? 60;
  const level: ConfidenceLevel = score >= 75 ? "high" : score >= 50 ? "medium" : "low";
  const bandPct =
    val.estimatedValue > 0
      ? Math.max(2, Math.round(((val.high - val.low) / 2 / val.estimatedValue) * 100))
      : 12;
  const confidence: ConfidenceOutput = {
    level,
    score,
    bandPct,
    factors: [],
    explanation: `Based on ${snapshot.comps.length} cited comparable sale${
      snapshot.comps.length === 1 ? "" : "s"
    } from public web data.`,
  };

  const applied: UserIntent = body.intent ?? "seller";
  const likely: LikelyIntent = body.intent ?? "unknown";

  return {
    ok: true,
    normalizedProperty,
    estimate,
    confidence,
    market: {
      city: city ?? "Unknown",
      state: state ?? "—",
      trend: "stable",
      medianPrice: null,
      pricePerSqft: val.avgPricePerSqft || null,
      source: "ai_web_search",
    },
    comps: {
      pricedCount: snapshot.comps.length,
      totalConsidered: snapshot.comps.length,
    },
    recommendations: recommendationsFor(applied),
    intentInference: {
      likely,
      scores: {
        seller: applied === "seller" ? 1 : 0,
        buyer: applied === "buyer" ? 1 : 0,
        investor: applied === "investor" ? 1 : 0,
      },
      rationale: [body.intent ? "Based on your selected goal." : "No explicit goal selected."],
      applied,
    },
    sessionId,
  };
}

function recommendationsFor(intent: UserIntent): ToolkitRecommendation[] {
  if (intent === "buyer") {
    return [
      { title: "Affordability Calculator", href: "/affordability-calculator", reason: "See what you can comfortably offer.", intent: "buyer" },
      { title: "Mortgage Calculator", href: "/mortgage-calculator", reason: "Estimate the monthly payment at this price.", intent: "buyer" },
    ];
  }
  if (intent === "investor") {
    return [
      { title: "Cap Rate Calculator", href: "/cap-rate-calculator", reason: "Check the rental yield at this value.", intent: "investor" },
      { title: "Cash Flow Calculator", href: "/cash-flow-calculator", reason: "Project monthly cash flow as a rental.", intent: "investor" },
    ];
  }
  return [
    { title: "AI CMA Analyzer", href: "/ai-cma-analyzer", reason: "Compare against recent sales before you list.", intent: "seller" },
    { title: "Closing Cost Estimator", href: "/closing-cost-estimator", reason: "Estimate your net proceeds at this price.", intent: "seller" },
  ];
}

function resolveCityStateZip(
  body: HomeValueEstimateRequest,
  address: string,
): { city: string | null; state: string | null; zip: string | null } {
  const zip = (body.zip ?? "").trim() || extractUsZipFromAddress(address);
  let city = (body.city ?? "").trim() || null;
  let state = (body.state ?? "").trim() || null;
  if (!city || !state) {
    const parts = address.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 3) {
      city = city ?? parts[parts.length - 2];
      state = state ?? (parts[parts.length - 1].split(/\s+/)[0] || null);
    } else if (parts.length === 2) {
      state = state ?? (parts[1].split(/\s+/)[0] || null);
    }
  }
  return { city, state, zip: zip || null };
}

function orNull(n: number): number | null {
  return typeof n === "number" && n > 0 ? n : null;
}

function numOrUndef(v: number | null | undefined): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;
}
