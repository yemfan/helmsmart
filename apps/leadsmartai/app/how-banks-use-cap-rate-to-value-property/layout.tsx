import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "How Banks Use Cap Rate to Value Property",
  description: "Learn how banks and lenders use cap rate in property valuation. Understand the lender perspective on cap rate analysis.",
  keywords: ["cap rate valuation", "bank valuation", "property value", "lender perspective", "real estate"],
};

export default async function BanksCapRateValuationLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
