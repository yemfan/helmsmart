import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.adjustableRateCalculator.title", { ns: "web_marketing" });
  const description = t("routeMeta.adjustableRateCalculator.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: ["ARM calculator", "adjustable rate mortgage", "rate adjustment", "mortgage payment", "real estate"],
};
}

export default async function AdjustableRateCalculatorLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
