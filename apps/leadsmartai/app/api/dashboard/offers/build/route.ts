import { NextResponse } from "next/server";
import { getAgentContextFromRequest } from "@/lib/dashboardService";
import { buildOfferRecommendation, type BuildOfferInput } from "@/lib/offers/buildOffer";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/dashboard/offers/build
 * Body: BuildOfferInput ({ address, listPrice, estimatedValue?, buyerMaxBudget?,
 *   financingType?, motivation?, marketHeat?, competingOffers? })
 *
 * Returns AI-recommended buyer offer terms + rationale + cover letter. The agent
 * reviews, then saves via the existing /api/dashboard/offers POST.
 */
export async function POST(req: Request) {
  try {
    await getAgentContextFromRequest(req); // auth gate (dual: cookie + mobile bearer)

    const body = (await req.json().catch(() => ({}))) as Partial<BuildOfferInput>;
    const address = typeof body.address === "string" ? body.address.trim() : "";
    const listPrice = typeof body.listPrice === "number" ? body.listPrice : Number(body.listPrice);
    if (!address) {
      return NextResponse.json({ ok: false, error: "Property address is required." }, { status: 400 });
    }
    if (!(listPrice > 0)) {
      return NextResponse.json({ ok: false, error: "A valid list price is required." }, { status: 400 });
    }

    const offer = await buildOfferRecommendation({
      address,
      listPrice,
      estimatedValue: numOrNull(body.estimatedValue),
      buyerMaxBudget: numOrNull(body.buyerMaxBudget),
      financingType: typeof body.financingType === "string" ? body.financingType : null,
      motivation: typeof body.motivation === "string" ? body.motivation.slice(0, 600) : null,
      marketHeat:
        body.marketHeat === "hot" || body.marketHeat === "balanced" || body.marketHeat === "cool"
          ? body.marketHeat
          : null,
      competingOffers: numOrNull(body.competingOffers),
    });
    return NextResponse.json({ ok: true, offer });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("POST /api/dashboard/offers/build:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

function numOrNull(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}
