import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.capRateVsIrr.title", { ns: "web_marketing" });
  const description = t("routeMeta.capRateVsIrr.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: ["cap rate", "IRR", "internal rate of return", "property returns", "real estate"],
};
}

export default async function CapRateIRRLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
