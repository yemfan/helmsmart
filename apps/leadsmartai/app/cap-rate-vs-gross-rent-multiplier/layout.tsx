import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.capRateVsGrm.title", { ns: "web_marketing" });
  const description = t("routeMeta.capRateVsGrm.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: ["cap rate", "gross rent multiplier", "GRM", "rental property", "valuation metrics"],
};
}

export default async function CapRateGRMLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
