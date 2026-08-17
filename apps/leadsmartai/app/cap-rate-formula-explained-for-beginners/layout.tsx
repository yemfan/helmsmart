import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Cap Rate Formula Explained for Beginners",
  description: "Learn cap rate formula basics. Understand how to calculate capitalization rate for real estate investments step-by-step.",
  keywords: ["cap rate formula", "how to calculate", "beginner guide", "real estate", "investment basics"],
};

export default async function CapRateFormulaLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
