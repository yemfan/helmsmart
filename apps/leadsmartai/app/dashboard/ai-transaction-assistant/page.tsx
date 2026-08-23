import type { Metadata } from "next";
import TransactionAssistantClient from "./TransactionAssistantClient";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("pages.dashboardTitles.aiTransactionAssistant", { ns: "dashboard" });
  return {
  title,
  description: "Deadline tracking, document reminders, and risk alerts for your active transactions.",
  robots: { index: false },
};
}

export default function AiTransactionAssistantPage() {
  return <TransactionAssistantClient />;
}
