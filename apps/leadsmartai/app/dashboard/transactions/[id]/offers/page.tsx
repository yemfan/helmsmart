import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { getTransactionWithChildren } from "@/lib/transactions/service";
import { listOffersForTransaction } from "@/lib/listing-offers/service";
import { ListingOffersCompareClient } from "./ListingOffersCompareClient";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("pages.dashboardTitles.offersOnListing", { ns: "dashboard" });
  return {
  title,
  robots: { index: false },
};
}

type PageProps = { params: Promise<{ id: string }> };

/**
 * Compare view: all incoming listing offers on a single listing,
 * side-by-side, with net-to-seller math.
 *
 * Only accessible when the parent transaction is listing_rep or dual —
 * the service enforces this and throws; we 404 the page here.
 */
export default async function ListingOffersPage({ params }: PageProps) {
  const { agentId } = await getCurrentAgentContext();
  const { id } = await params;

  const tx = await getTransactionWithChildren(String(agentId), id);
  if (!tx) notFound();
  if (tx.transaction.transaction_type !== "listing_rep" && tx.transaction.transaction_type !== "dual") {
    notFound();
  }

  let offers;
  try {
    offers = await listOffersForTransaction(String(agentId), id);
  } catch {
    notFound();
  }

  return (
    <ListingOffersCompareClient
      transaction={{
        id: tx.transaction.id,
        property_address: tx.transaction.property_address,
        city: tx.transaction.city,
        state: tx.transaction.state,
        zip: tx.transaction.zip,
        purchase_price: tx.transaction.purchase_price,
        transaction_type: tx.transaction.transaction_type,
      }}
      initialOffers={offers}
    />
  );
}
