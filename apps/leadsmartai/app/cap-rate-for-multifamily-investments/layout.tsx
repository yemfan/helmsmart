import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Cap Rate for Multifamily Investments",
  description: "Understand cap rates for multifamily and apartment building investments. Analyze returns for multi-unit rental properties.",
  keywords: ["cap rate", "multifamily", "apartment building", "rental investment", "real estate"],
};

export default async function CapRateMultifamilyLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
