import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.refinanceCalculator.title", { ns: "web_marketing" });
  const description = t("routeMeta.refinanceCalculator.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: ["refinance calculator", "mortgage refinance", "savings", "lower rate", "real estate"],
};
}

export default async function RefinanceCalculatorLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
