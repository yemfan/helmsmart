import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.capRateByCity.title", { ns: "web_marketing" });
  const description = t("routeMeta.capRateByCity.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: ["cap rate", "by city", "market data", "real estate", "investment comparison"],
};
}

export default async function CapRateByCityLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
