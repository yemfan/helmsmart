import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.capRateMultifamily.title", { ns: "web_marketing" });
  const description = t("routeMeta.capRateMultifamily.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: ["cap rate", "multifamily", "apartment building", "rental investment", "real estate"],
};
}

export default async function CapRateMultifamilyLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
