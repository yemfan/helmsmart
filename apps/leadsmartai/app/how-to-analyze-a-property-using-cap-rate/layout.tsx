import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.analyzeWithCapRate.title", { ns: "web_marketing" });
  const description = t("routeMeta.analyzeWithCapRate.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: ["cap rate analysis", "property analysis", "rental property", "investment guide", "real estate"],
};
}

export default async function CapRateAnalysisLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
