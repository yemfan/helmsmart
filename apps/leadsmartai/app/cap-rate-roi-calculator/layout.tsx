import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Cap Rate and ROI Calculator",
  description: "Calculate capitalization rate and return on investment side-by-side. Compare rental property cap rate and ROI metrics for better analysis.",
  keywords: ["cap rate", "ROI calculator", "return on investment", "rental property", "real estate"],
};

export default async function CapRateROICalculatorLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
