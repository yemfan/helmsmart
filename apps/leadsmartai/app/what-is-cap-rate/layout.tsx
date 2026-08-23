import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.whatIsCapRate.title", { ns: "web_marketing" });
  const description = t("routeMeta.whatIsCapRate.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: ["what is cap rate", "capitalization rate", "definition", "real estate", "investment basics"],
};
}

export default async function WhatIsCapRateLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
