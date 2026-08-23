import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.howToCalculateCapRate.title", { ns: "web_marketing" });
  const description = t("routeMeta.howToCalculateCapRate.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: ["how to calculate", "cap rate formula", "capitalization rate", "real estate", "investment guide"],
};
}

export default async function HowToCalculateCapRateLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
