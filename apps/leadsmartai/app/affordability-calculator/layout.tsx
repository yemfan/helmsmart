import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.affordabilityCalculator.title", { ns: "web_marketing" });
  const description = t("routeMeta.affordabilityCalculator.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: ["affordability calculator", "home price", "mortgage", "DTI ratio", "real estate"],
};
}

export default async function AffordabilityCalculatorLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
