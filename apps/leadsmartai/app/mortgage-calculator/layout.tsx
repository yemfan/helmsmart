import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.mortgageCalculator.title", { ns: "web_marketing" });
  const description = t("routeMeta.mortgageCalculator.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: ["mortgage calculator", "monthly payment", "loan calculator", "interest rate", "real estate"],
};
}

export default async function MortgageCalculatorLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
