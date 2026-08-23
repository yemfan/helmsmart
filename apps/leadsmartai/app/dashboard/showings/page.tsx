import type { Metadata } from "next";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { listShowingsForAgent } from "@/lib/showings/service";
import { ShowingsListClient } from "./ShowingsListClient";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("pages.dashboardTitles.showings", { ns: "dashboard" });
  return {
  title,
  description: "Buyer-side property showings — schedule, track, capture feedback.",
  robots: { index: false },
};
}

type PageProps = {
  searchParams: Promise<{ contactId?: string }>;
};

export default async function ShowingsPage({ searchParams }: PageProps) {
  const { agentId } = await getCurrentAgentContext();
  const { contactId } = await searchParams;
  const showings = await listShowingsForAgent(String(agentId), { contactId });
  return <ShowingsListClient initialShowings={showings} initialContactFilter={contactId ?? null} />;
}
