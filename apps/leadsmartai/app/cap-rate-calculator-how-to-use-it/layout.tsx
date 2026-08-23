import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.capRateCalculatorHowToUse.title", { ns: "web_marketing" });
  const description = t("routeMeta.capRateCalculatorHowToUse.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: ["cap rate", "calculator guide", "NOI", "investment analysis", "real estate"],
};
}

export default async function CapRateCalculatorHowToUseLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
