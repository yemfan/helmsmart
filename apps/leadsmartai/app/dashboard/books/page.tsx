import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";
import { listInvoices } from "@/lib/books/invoices";
import BooksClient from "@/components/dashboard/BooksClient";
import FeatureUpgradeCard from "@/components/billing/FeatureUpgradeCard";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { userHasCrmFeature } from "@/lib/billing/subscriptionAccess";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.books.metaTitle", { ns: "dashboard" }),
    description: t("pages.books.metaDescription", { ns: "dashboard" }),
    robots: { index: false },
  };
}

/**
 * Books — simple client invoicing for the realtor. Server component fetches the
 * agent's invoices; the client component handles the create form + status actions.
 */
export default async function BooksPage() {
  const t = await getServerT();
  const { userId } = await getCurrentAgentContext();
  if (!(await userHasCrmFeature(userId, "bookkeeping"))) {
    return (
      <FeatureUpgradeCard
        title={t("pages.books.upgradeTitle", { ns: "dashboard" })}
        description={t("pages.books.upgradeDescription", { ns: "dashboard" })}
        requiredPlan="Pro"
      />
    );
  }
  const invoices = await listInvoices(200);
  return <BooksClient initialInvoices={invoices} />;
}
