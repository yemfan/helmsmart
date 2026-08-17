import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Refinance Calculator",
  description: "Calculate refinance savings and break-even point. Compare current mortgage with new loan options to determine if refinancing saves money.",
  keywords: ["refinance calculator", "mortgage refinance", "savings", "lower rate", "real estate"],
};

export default async function RefinanceCalculatorLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
