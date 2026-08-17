import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { listOpenHousesForAgent } from "@/lib/open-houses/service";
import { OpenHousesListClient } from "./OpenHousesListClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.openHouses.metaTitle", { ns: "dashboard" }),
    keywords: ["open houses", "events", "lead capture", "sign-in"],
    robots: { index: false },
  };
}

export default async function OpenHousesPage() {
  const { agentId } = await getCurrentAgentContext();
  const openHouses = await listOpenHousesForAgent(String(agentId));
  return <OpenHousesListClient initialOpenHouses={openHouses} />;
}
