import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.capRateExample.title", { ns: "web_marketing" });
  const description = t("routeMeta.capRateExample.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: ["cap rate example", "rental property", "calculation example", "real estate", "investment analysis"],
};
}

export default async function CapRateExampleLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
