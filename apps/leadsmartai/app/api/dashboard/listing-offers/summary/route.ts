import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { summarizeOffers, type OfferForSummary } from "@/lib/listing-offers/compareSummary";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/dashboard/listing-offers/summary
 * Body: { listPrice: number | null, offers: OfferForSummary[] }
 *
 * Returns an AI summary + recommendation over the listing's offers. The client
 * passes the already-computed net-to-seller per offer (with the agent's tuned
 * assumptions), so the AI reasons over the exact numbers the agent sees.
 */
export async function POST(req: Request) {
  try {
    await getCurrentAgentContext(); // auth gate

    const body = (await req.json().catch(() => ({}))) as {
      listPrice?: unknown;
      offers?: unknown;
    };
    const offers = Array.isArray(body.offers) ? (body.offers as OfferForSummary[]) : [];
    if (offers.length === 0) {
      return NextResponse.json({ ok: false, error: "No offers to summarize." }, { status: 400 });
    }
    const listPrice = typeof body.listPrice === "number" ? body.listPrice : null;

    const summary = await summarizeOffers({ listPrice, offers });
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("POST /api/dashboard/listing-offers/summary:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
