import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Home Affordability Calculator",
  description: "Calculate how much house you can afford based on income, debts, and interest rate using a debt-to-income ratio calculator.",
  keywords: ["affordability calculator", "home price", "mortgage", "DTI ratio", "real estate"],
};

export default async function AffordabilityCalculatorLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
