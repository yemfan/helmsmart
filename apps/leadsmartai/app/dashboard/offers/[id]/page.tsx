import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { getOfferWithCounters } from "@/lib/offers/service";
import { OfferDetailClient } from "./OfferDetailClient";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Offer",
  robots: { index: false },
};

type PageProps = { params: Promise<{ id: string }> };

export default async function OfferDetailPage({ params }: PageProps) {
  const t = await getServerT();
  const { agentId } = await getCurrentAgentContext();
  const { id } = await params;
  const result = await getOfferWithCounters(String(agentId), id);
  if (!result) notFound();
  return (
    <OfferDetailClient
      offer={result.offer}
      counters={result.counters}
      contactName={result.contactName}
    />
  );
}
