import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.capRateMistakes.title", { ns: "web_marketing" });
  const description = t("routeMeta.capRateMistakes.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: ["cap rate mistakes", "common errors", "real estate mistakes", "investment tips", "analysis errors"],
};
}

export default async function CapRateMistakesLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
