import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Cap Rate Example for Rental Property",
  description: "Learn cap rate with real examples. See how to calculate capitalization rate for actual rental properties and deals.",
  keywords: ["cap rate example", "rental property", "calculation example", "real estate", "investment analysis"],
};

export default async function CapRateExampleLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
