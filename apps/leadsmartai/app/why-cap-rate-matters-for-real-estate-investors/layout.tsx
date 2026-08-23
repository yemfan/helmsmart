import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.whyCapRateMatters.title", { ns: "web_marketing" });
  const description = t("routeMeta.whyCapRateMatters.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: ["cap rate importance", "why cap rate matters", "real estate investing", "property metrics", "analysis"],
};
}

export default async function CapRateImportanceLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
