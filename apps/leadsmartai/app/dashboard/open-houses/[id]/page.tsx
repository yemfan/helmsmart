import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";
import { notFound } from "next/navigation";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { getOpenHouseWithVisitors } from "@/lib/open-houses/service";
import { OpenHouseDetailClient } from "./OpenHouseDetailClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.openHouseDetail.metaTitle", { ns: "dashboard" }),
    robots: { index: false },
  };
}

type PageProps = { params: Promise<{ id: string }> };

export default async function OpenHouseDetailPage({ params }: PageProps) {
  const { agentId } = await getCurrentAgentContext();
  const { id } = await params;
  const result = await getOpenHouseWithVisitors(String(agentId), id);
  if (!result) notFound();

  return (
    <OpenHouseDetailClient
      openHouse={result.openHouse}
      visitors={result.visitors}
    />
  );
}
