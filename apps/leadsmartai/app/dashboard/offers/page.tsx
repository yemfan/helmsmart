import type { Metadata } from "next";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { listOffersForAgent } from "@/lib/offers/service";
import { OffersListClient } from "./OffersListClient";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("pages.dashboardTitles.offers", { ns: "dashboard" });
  return {
  title,
  description: "Track buyer-side offers: drafts, submissions, counters, accepts/rejects.",
  robots: { index: false },
};
}

type PageProps = {
  searchParams: Promise<{ contactId?: string }>;
};

export default async function OffersPage({ searchParams }: PageProps) {
  const { agentId } = await getCurrentAgentContext();
  const { contactId } = await searchParams;
  const offers = await listOffersForAgent(String(agentId), { contactId });
  return <OffersListClient initialOffers={offers} initialContactFilter={contactId ?? null} />;
}
