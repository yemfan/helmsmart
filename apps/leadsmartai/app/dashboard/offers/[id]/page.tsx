import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { getOfferWithCounters } from "@/lib/offers/service";
import { OfferDetailClient } from "./OfferDetailClient";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("pages.dashboardTitles.offer", { ns: "dashboard" });
  return {
  title,
  robots: { index: false },
};
}

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
