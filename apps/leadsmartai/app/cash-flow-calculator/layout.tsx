import { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.cashFlowCalculator.title", { ns: "web_marketing" });
  const description = t("routeMeta.cashFlowCalculator.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: ["cash flow calculator", "rental property", "monthly income", "expenses", "real estate investing"],
};
}

export default async function CashFlowCalculatorLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
