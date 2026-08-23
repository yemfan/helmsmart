import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.goodCapRate.title", { ns: "web_marketing" });
  const description = t("routeMeta.goodCapRate.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: ["good cap rate", "cap rate range", "rental property", "benchmark", "real estate investing"],
};
}

export default async function GoodCapRateLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
