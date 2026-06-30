import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { createListingOffer } from "./service";
import type { FinancingType } from "./types";
import type { ParsedOffer } from "@/lib/offers/parsedShape";

/**
 * Bridge an inbound-extracted offer into a structured `listing_offers` row, so a
 * forwarded offer email actually populates the offers table that the
 * compare/summarize tools read — instead of only sitting on the delivery as a
 * review item.
 *
 * Conservative by design: only auto-creates when the offer has a price AND its
 * property address matches exactly ONE of the agent's listings. Anything
 * ambiguous (no match, multiple matches, no price) is left as a review item for
 * the agent to add by hand. Dedupes on the delivery id (carried in `notes`) so
 * reprocessing the same email never double-creates.
 */

function normAddr(a: string): string {
  return a
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type InboundOfferBridgeResult =
  | { created: true; listingOfferId: string; listingId: string }
  | { created: false; reason: string };

export async function bridgeInboundOfferToListing(args: {
  agentId: string;
  parsed: ParsedOffer;
  deliveryId: string;
}): Promise<InboundOfferBridgeResult> {
  const { agentId, parsed, deliveryId } = args;

  if (!(typeof parsed.offerPrice === "number" && parsed.offerPrice > 0)) {
    return { created: false, reason: "no offer price extracted" };
  }
  const addr = parsed.propertyAddress?.trim();
  if (!addr) return { created: false, reason: "no property address extracted" };

  // Find the agent's listing(s) for this address. ilike on a leading slice keeps
  // the SQL filter loose; normalized comparison below makes the decision.
  const { data: rows } = await supabaseAdmin
    .from("listings")
    .select("id, property_address")
    .eq("agent_id", agentId)
    .ilike("property_address", `%${addr.slice(0, 40)}%`)
    .limit(5);
  const listings = (rows ?? []) as { id: string; property_address: string | null }[];
  const target = normAddr(addr);
  const exact = listings.filter((l) => normAddr(l.property_address ?? "") === target);
  const candidate = exact.length === 1 ? exact[0] : listings.length === 1 ? listings[0] : null;
  if (!candidate) {
    return {
      created: false,
      reason: listings.length === 0 ? "no matching listing" : "ambiguous listing match",
    };
  }

  // Dedupe: skip if this delivery already produced an offer on this listing.
  const marker = `[inbound:${deliveryId}]`;
  const { data: dupe } = await supabaseAdmin
    .from("listing_offers")
    .select("id")
    .eq("listing_id", candidate.id)
    .ilike("notes", `%${marker}%`)
    .limit(1)
    .maybeSingle();
  if (dupe) return { created: false, reason: "already bridged" };

  // ParsedOffer contingency booleans use WAIVES semantics (true = waived);
  // listing_offers uses KEEP semantics (true = contingency present). Invert,
  // leaving undefined (→ createListingOffer's keep-by-default) when unknown.
  const keep = (waived: boolean | null): boolean | undefined =>
    waived == null ? undefined : !waived;

  const note = [parsed.notes, `Auto-captured from a forwarded offer email. ${marker}`]
    .filter(Boolean)
    .join(" — ");

  const offer = await createListingOffer({
    agentId,
    listingId: candidate.id,
    offerPrice: parsed.offerPrice,
    earnestMoney: parsed.earnestMoney,
    downPayment: parsed.downPayment,
    financingType: (parsed.financingType as FinancingType | null) ?? null,
    closingDateProposed: parsed.closingDateProposed,
    offerExpiresAt: parsed.offerExpiresAt,
    inspectionContingency: keep(parsed.inspectionContingency),
    appraisalContingency: keep(parsed.appraisalContingency),
    loanContingency: keep(parsed.loanContingency),
    contingencyNotes: parsed.contingencyNotes,
    notes: note,
  });

  return { created: true, listingOfferId: offer.id, listingId: candidate.id };
}
