import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "How to Increase Cap Rate on Rental Property",
  description: "Strategies to improve cap rate on rental properties. Learn how to increase NOI and boost investment returns.",
  keywords: ["increase cap rate", "improve returns", "rental property", "NOI", "real estate investing"],
};

export default async function IncreaseCapRateLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
