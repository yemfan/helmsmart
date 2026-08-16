import { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Cap Rate Calculator",
  description: "Calculate capitalization rate and NOI for rental properties. Analyze investment returns and compare deals with our property cap rate calculator.",
  keywords: ["cap rate calculator", "NOI", "capitalization rate", "rental property", "real estate investing"],
};

export default async function CapRateCalculatorLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
