import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.capRateRoiCalculator.title", { ns: "web_marketing" });
  const description = t("routeMeta.capRateRoiCalculator.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: ["cap rate", "ROI calculator", "return on investment", "rental property", "real estate"],
};
}

export default async function CapRateROICalculatorLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
