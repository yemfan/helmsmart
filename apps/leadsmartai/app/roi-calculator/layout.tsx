import { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "ROI Calculator",
  description: "Calculate return on investment for rental properties and real estate deals. Analyze cash-on-cash returns, annual ROI, and property appreciation.",
  keywords: ["ROI calculator", "return on investment", "rental property", "cash on cash", "real estate investing"],
};

export default async function ROICalculatorLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
