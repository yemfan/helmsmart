import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const th = (key: string): string => t(key, { ns: "web_home_value_estimator" });
  return {
    title: th("meta.title"),
    description: th("meta.description"),
    keywords: ["home value", "home appraisal", "property value", "comparable sales", "real estate valuation"],
  };
}

export default function HomeValueEstimatorLayout({
  children,
}: { children: React.ReactNode }) {
  return children;
}
