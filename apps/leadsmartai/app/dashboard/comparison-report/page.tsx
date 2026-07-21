import { getCurrentAgentContext } from "@/lib/dashboardService";
import ComparisonReportBuilderClient from "./ComparisonReportBuilderClient";

export const metadata = {
  title: "AI Property Comparison Report | CloseBoss",
};

export default async function ComparisonReportDashboardPage() {
  const ctx = await getCurrentAgentContext();
  return <ComparisonReportBuilderClient planType={ctx.planType} />;
}
