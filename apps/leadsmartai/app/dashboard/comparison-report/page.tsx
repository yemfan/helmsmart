import type { Metadata } from "next";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { getServerT } from "@/lib/i18n/server";
import ComparisonReportBuilderClient from "./ComparisonReportBuilderClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return { title: `${t("pages.comparisonReport.metaTitle", { ns: "dashboard" })} | CloseBoss` };
}

export default async function ComparisonReportDashboardPage() {
  const ctx = await getCurrentAgentContext();
  return <ComparisonReportBuilderClient planType={ctx.planType} />;
}
