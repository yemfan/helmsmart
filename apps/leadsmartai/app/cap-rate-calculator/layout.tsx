import { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.capRateCalculator.title", { ns: "web_marketing" });
  const description = t("routeMeta.capRateCalculator.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: ["cap rate calculator", "NOI", "capitalization rate", "rental property", "real estate investing"],
};
}

export default async function CapRateCalculatorLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
