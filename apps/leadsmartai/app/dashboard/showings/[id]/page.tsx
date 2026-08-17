import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";
import { notFound } from "next/navigation";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { getShowingWithFeedback } from "@/lib/showings/service";
import { ShowingDetailClient } from "./ShowingDetailClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.showingDetail.metaTitle", { ns: "dashboard" }),
    robots: { index: false },
  };
}

type PageProps = { params: Promise<{ id: string }> };

export default async function ShowingDetailPage({ params }: PageProps) {
  const { agentId } = await getCurrentAgentContext();
  const { id } = await params;
  const result = await getShowingWithFeedback(String(agentId), id);
  if (!result) notFound();
  return (
    <ShowingDetailClient
      showing={result.showing}
      feedback={result.feedback}
      contactName={result.contactName}
      siblings={result.siblingShowings}
    />
  );
}
