import type { Metadata } from "next";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { listTransactionsForAgent } from "@/lib/transactions/service";
import { TransactionsListClient } from "./TransactionsListClient";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("pages.dashboardTitles.transactions", { ns: "dashboard" });
  return {
  title,
  description: "Active closings with deadlines, tasks, and counterparties.",
  robots: { index: false },
};
}

export default async function TransactionsPage() {
  const { agentId } = await getCurrentAgentContext();
  const transactions = await listTransactionsForAgent(String(agentId));
  return <TransactionsListClient initialItems={transactions} />;
}
