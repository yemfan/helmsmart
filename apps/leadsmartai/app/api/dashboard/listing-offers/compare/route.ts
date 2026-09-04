import { NextResponse } from "next/server";
import { getAgentContextFromRequest } from "@/lib/dashboardService";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { listOffersForListing } from "@/lib/listing-offers/service";
import {
  computeNetToSeller,
  DEFAULT_NET_TO_SELLER_ASSUMPTIONS,
} from "@/lib/listing-offers/netToSeller";
import { summarizeOffers, type OfferForSummary } from "@/lib/listing-offers/compareSummary";
import { getServerLocale } from "@/lib/i18n/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Mobile-friendly offer comparison. Keeps the client thin — the server loads a
 * listing's offers, computes net-to-seller per offer (default assumptions), and
 * runs the AI summary in one call. Dual-auth (cookie + mobile bearer).
 *
 *   GET  → the agent's listings that have live offers, for the picker:
 *          { listings: [{ listingId, address, listPrice, offerCount }] }
 *   POST { listingId } → { listing, offers: [...with net], summary }
 */

const DEAD = new Set(["rejected", "withdrawn", "expired"]);

export async function GET(req: Request) {
  try {
    const { agentId } = await getAgentContextFromRequest(req);
    const { data: offerRows } = await supabaseAdmin
      .from("listing_offers")
      .select("listing_id, status")
      .eq("agent_id", agentId)
      .not("listing_id", "is", null);
    const counts = new Map<string, number>();
    for (const r of (offerRows ?? []) as { listing_id: string | null; status: string }[]) {
      if (!r.listing_id || DEAD.has(r.status)) continue;
      counts.set(r.listing_id, (counts.get(r.listing_id) ?? 0) + 1);
    }
    const ids = [...counts.keys()];
    if (ids.length === 0) return NextResponse.json({ ok: true, listings: [] });

    const { data: listingRows } = await supabaseAdmin
      .from("listings")
      .select("id, property_address, list_price")
      .eq("agent_id", agentId)
      .in("id", ids);
    const listings = ((listingRows ?? []) as { id: string; property_address: string | null; list_price: number | null }[])
      .map((l) => ({
        listingId: l.id,
        address: l.property_address ?? "(no address)",
        listPrice: l.list_price ?? null,
        offerCount: counts.get(l.id) ?? 0,
      }))
      .filter((l) => l.offerCount > 0)
      .sort((a, b) => b.offerCount - a.offerCount);

    return NextResponse.json({ ok: true, listings });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { agentId } = await getAgentContextFromRequest(req);
    const body = (await req.json().catch(() => ({}))) as { listingId?: unknown };
    const listingId = typeof body.listingId === "string" ? body.listingId : "";
    if (!listingId) {
      return NextResponse.json({ ok: false, error: "listingId is required." }, { status: 400 });
    }

    const { data: listingRow } = await supabaseAdmin
      .from("listings")
      .select("id, property_address, list_price")
      .eq("id", listingId)
      .eq("agent_id", agentId)
      .maybeSingle();
    const listing = listingRow as { id: string; property_address: string | null; list_price: number | null } | null;
    if (!listing) {
      return NextResponse.json({ ok: false, error: "Listing not found." }, { status: 404 });
    }

    const items = (await listOffersForListing(agentId, listingId)).filter((o) => !DEAD.has(o.status));
    if (items.length === 0) {
      return NextResponse.json({ ok: false, error: "No live offers on this listing." }, { status: 400 });
    }

    const offers: OfferForSummary[] = items.map((o) => {
      const price = o.current_price ?? o.offer_price;
      const net = computeNetToSeller({
        price,
        commissionPct: DEFAULT_NET_TO_SELLER_ASSUMPTIONS.commissionPct,
        titleEscrowPct: DEFAULT_NET_TO_SELLER_ASSUMPTIONS.titleEscrowPct,
        transferTaxPct: DEFAULT_NET_TO_SELLER_ASSUMPTIONS.transferTaxPct,
        sellerConcessions: o.seller_concessions ?? 0,
        otherCostsFlat: DEFAULT_NET_TO_SELLER_ASSUMPTIONS.otherCostsFlat,
      }).net;
      return {
        id: o.id,
        buyerName: o.buyer_name,
        price,
        net,
        financing: o.financing_type,
        isCash: o.is_cash,
        contingencyCount: o.contingency_count,
        sellerConcessions: o.seller_concessions,
        closeDate: o.closing_date_proposed,
        status: o.status,
      };
    });

    const summary = await summarizeOffers({
      listPrice: listing.list_price,
      offers,
      locale: await getServerLocale(),
    });

    return NextResponse.json({
      ok: true,
      listing: { id: listing.id, address: listing.property_address, listPrice: listing.list_price },
      offers,
      summary,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("POST /api/dashboard/listing-offers/compare:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
