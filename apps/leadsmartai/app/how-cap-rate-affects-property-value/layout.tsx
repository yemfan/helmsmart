import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "How Cap Rate Affects Property Value",
  description: "Understand how cap rate impacts property values. Learn the relationship between capitalization rate and property pricing.",
  keywords: ["cap rate property value", "property pricing", "valuation", "real estate", "investment metrics"],
};

export default async function CapRatePropertyValueLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
