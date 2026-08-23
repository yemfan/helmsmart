import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.downPaymentCalculator.title", { ns: "web_marketing" });
  const description = t("routeMeta.downPaymentCalculator.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: ["down payment calculator", "home purchase", "loan amount", "PMI", "mortgage"],
};
}

export default async function DownPaymentCalculatorLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
