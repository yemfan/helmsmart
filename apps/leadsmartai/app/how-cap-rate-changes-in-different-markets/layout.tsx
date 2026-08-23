import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.capRateAcrossMarkets.title", { ns: "web_marketing" });
  const description = t("routeMeta.capRateAcrossMarkets.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: ["cap rate markets", "market comparison", "regional cap rates", "real estate", "market analysis"],
};
}

export default async function CapRateMarketChangesLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
