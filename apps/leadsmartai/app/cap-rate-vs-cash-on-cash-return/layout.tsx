import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.capRateVsCoc.title", { ns: "web_marketing" });
  const description = t("routeMeta.capRateVsCoc.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: ["cap rate", "cash on cash return", "rental property", "investment metrics", "real estate"],
};
}

export default async function CapRateCashOnCashLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
