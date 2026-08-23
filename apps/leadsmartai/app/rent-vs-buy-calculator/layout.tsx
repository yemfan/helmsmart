import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.rentVsBuyCalculator.title", { ns: "web_marketing" });
  const description = t("routeMeta.rentVsBuyCalculator.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: ["rent vs buy", "rent calculator", "buy calculator", "home ownership", "real estate"],
};
}

export default async function RentVsBuyCalculatorLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
