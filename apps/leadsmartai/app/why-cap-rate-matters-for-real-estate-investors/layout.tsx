import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Why Cap Rate Matters for Real Estate Investors",
  description: "Understand the importance of cap rate for real estate investors. Learn why capitalization rate matters in property analysis.",
  keywords: ["cap rate importance", "why cap rate matters", "real estate investing", "property metrics", "analysis"],
};

export default async function CapRateImportanceLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
