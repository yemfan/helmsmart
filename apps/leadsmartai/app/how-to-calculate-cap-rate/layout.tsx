import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "How to Calculate Cap Rate",
  description: "Learn how to calculate cap rate step-by-step. Complete guide for real estate investors and professional property analysis.",
  keywords: ["how to calculate", "cap rate formula", "capitalization rate", "real estate", "investment guide"],
};

export default async function HowToCalculateCapRateLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
