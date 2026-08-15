import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";
import { listExpenses, expenseTotals } from "@/lib/books/expenses";
import ExpensesClient from "@/components/dashboard/ExpensesClient";
import FeatureUpgradeCard from "@/components/billing/FeatureUpgradeCard";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { userHasCrmFeature } from "@/lib/billing/subscriptionAccess";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.expenses.metaTitle", { ns: "dashboard" }),
    description: t("pages.expenses.metaDescription", { ns: "dashboard" }),
    robots: { index: false },
  };
}

function monthStart(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
function yearStart(d: Date): string {
  return `${d.getUTCFullYear()}-01-01`;
}

/**
 * Expenses — realtor business-cost tracking for bookkeeping/taxes. A realtor's
 * income is commission, so the bookkeeping pain is logging COSTS, not billing
 * clients. Server component loads recent expenses + this-month / YTD totals.
 */
export default async function ExpensesPage() {
  const t = await getServerT();
  const { userId } = await getCurrentAgentContext();
  if (!(await userHasCrmFeature(userId, "bookkeeping"))) {
    return (
      <FeatureUpgradeCard
        title={t("pages.expenses.upgradeTitle", { ns: "dashboard" })}
        description={t("pages.expenses.upgradeDescription", { ns: "dashboard" })}
        requiredPlan="Pro"
      />
    );
  }
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const [expenses, month, year] = await Promise.all([
    listExpenses({ limit: 200 }),
    expenseTotals({ from: monthStart(now), to: today }),
    expenseTotals({ from: yearStart(now), to: today }),
  ]);
  return (
    <ExpensesClient
      initialExpenses={expenses}
      monthTotals={month}
      yearTotals={year}
    />
  );
}
