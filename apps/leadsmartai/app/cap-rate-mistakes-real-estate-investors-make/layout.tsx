import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Cap Rate Mistakes Real Estate Investors Make",
  description: "Learn common cap rate mistakes investors make. Avoid errors in capitalization rate calculation and property analysis.",
  keywords: ["cap rate mistakes", "common errors", "real estate mistakes", "investment tips", "analysis errors"],
};

export default async function CapRateMistakesLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
