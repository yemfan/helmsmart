import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "What is a Good Cap Rate for Rental Property",
  description: "Understand what constitutes a good cap rate. Market benchmarks and cap rate ranges for rental property investments.",
  keywords: ["good cap rate", "cap rate range", "rental property", "benchmark", "real estate investing"],
};

export default async function GoodCapRateLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
