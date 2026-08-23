import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.increaseCapRate.title", { ns: "web_marketing" });
  const description = t("routeMeta.increaseCapRate.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: ["increase cap rate", "improve returns", "rental property", "NOI", "real estate investing"],
};
}

export default async function IncreaseCapRateLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
