import { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.closingCostEstimator.title", { ns: "web_marketing" });
  const description = t("routeMeta.closingCostEstimator.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: ["closing costs", "home purchase", "loan fees", "title insurance", "real estate"],
};
}

export default async function ClosingCostEstimatorLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
