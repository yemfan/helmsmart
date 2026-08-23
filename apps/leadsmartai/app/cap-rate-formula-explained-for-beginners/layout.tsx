import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.capRateFormulaBeginners.title", { ns: "web_marketing" });
  const description = t("routeMeta.capRateFormulaBeginners.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: ["cap rate formula", "how to calculate", "beginner guide", "real estate", "investment basics"],
};
}

export default async function CapRateFormulaLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
