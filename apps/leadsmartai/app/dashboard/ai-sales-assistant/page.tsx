import type { Metadata } from "next";
import SalesAssistantClient from "./SalesAssistantClient";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("pages.dashboardTitles.aiSalesAssistant", { ns: "dashboard" });
  return {
  title,
  description: "Lead follow-up, reactivation, and appointment booking by your AI Sales Assistant.",
  robots: { index: false },
};
}

export default function AiSalesAssistantPage() {
  return <SalesAssistantClient />;
}
