import { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Cash Flow Calculator",
  description: "Calculate monthly and annual cash flow for rental properties. Analyze income, expenses, and profitability with our property cash flow calculator.",
  keywords: ["cash flow calculator", "rental property", "monthly income", "expenses", "real estate investing"],
};

export default async function CashFlowCalculatorLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
