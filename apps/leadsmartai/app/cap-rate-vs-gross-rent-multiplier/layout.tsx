import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Cap Rate vs Gross Rent Multiplier",
  description: "Compare cap rate and gross rent multiplier. Understand key differences for rental property valuation and investment analysis.",
  keywords: ["cap rate", "gross rent multiplier", "GRM", "rental property", "valuation metrics"],
};

export default async function CapRateGRMLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
