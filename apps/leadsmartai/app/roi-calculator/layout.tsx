import { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.roiCalculator.title", { ns: "web_marketing" });
  const description = t("routeMeta.roiCalculator.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: ["ROI calculator", "return on investment", "rental property", "cash on cash", "real estate investing"],
};
}

export default async function ROICalculatorLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
