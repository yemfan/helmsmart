import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Adjustable Rate Mortgage Calculator",
  description: "Calculate ARM payments and rate adjustments over time. Compare initial rates, caps, and long-term costs for adjustable mortgages.",
  keywords: ["ARM calculator", "adjustable rate mortgage", "rate adjustment", "mortgage payment", "real estate"],
};

export default async function AdjustableRateCalculatorLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
