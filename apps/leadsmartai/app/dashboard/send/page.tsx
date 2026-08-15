import { getCurrentAgentContext } from "@/lib/dashboardService";
import { SendClient } from "./SendClient";
import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.send.metaTitle", { ns: "dashboard" }),
    description: t("pages.send.metaDescription", { ns: "dashboard" }),
    keywords: ["send", "email", "outreach"],
    robots: { index: false },
  };
}

export default async function SendPage() {
  const { agentId } = await getCurrentAgentContext();

  return <SendClient agent={agentId} />;
}

