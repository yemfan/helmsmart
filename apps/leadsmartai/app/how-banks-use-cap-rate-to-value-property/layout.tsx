import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.banksCapRate.title", { ns: "web_marketing" });
  const description = t("routeMeta.banksCapRate.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: ["cap rate valuation", "bank valuation", "property value", "lender perspective", "real estate"],
};
}

export default async function BanksCapRateValuationLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
