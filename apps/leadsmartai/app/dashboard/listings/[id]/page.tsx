import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";
import { notFound } from "next/navigation";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { getListingById } from "@/lib/listings/service";
import { listOffersForListing } from "@/lib/listing-offers/service";
import { ListingDetailClient } from "./ListingDetailClient";

/**
 * Listing detail page (Phase 2b of the listings/transactions split).
 *
 * Note the URL: /dashboard/listings/[id] — distinct from
 * /dashboard/transactions/[id] which still serves post-acceptance
 * deals. A listing's back-linked transaction (if any) is reachable
 * from this page via the "Open contracted deal" link.
 *
 * Backwards compat: old /dashboard/transactions/[id] URLs that
 * happen to point at a listing-rep transaction still work — they
 * render the legacy TransactionDetailClient. Phase 3 deletes the
 * pure listing-rep transactions (the ones without an accepted
 * offer) so those URLs would 404 cleanly; until then both paths
 * coexist.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.listingDetail.metaTitle", { ns: "dashboard" }),
    robots: { index: false },
  };
}

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { agentId } = await getCurrentAgentContext();
  const { id } = await params;
  const listing = await getListingById(String(agentId), id);
  if (!listing) {
    notFound();
  }
  // Fetch offers received on this listing in parallel with the
  // listing fetch is overkill here (the listing is required first
  // for the not-found short-circuit); fetch sequentially so the
  // 404 path doesn't run a wasted query.
  const offers = await listOffersForListing(String(agentId), id);
  return <ListingDetailClient listing={listing} offers={offers} />;
}
