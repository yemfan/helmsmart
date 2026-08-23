import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.capRateAffectsValue.title", { ns: "web_marketing" });
  const description = t("routeMeta.capRateAffectsValue.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: ["cap rate property value", "property pricing", "valuation", "real estate", "investment metrics"],
};
}

export default async function CapRatePropertyValueLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
