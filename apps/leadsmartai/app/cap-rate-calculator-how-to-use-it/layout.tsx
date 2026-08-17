import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "How to Use a Cap Rate Calculator",
  description: "Learn how to use a cap rate calculator to evaluate rental property investments and calculate capitalization rates effectively.",
  keywords: ["cap rate", "calculator guide", "NOI", "investment analysis", "real estate"],
};

export default async function CapRateCalculatorHowToUseLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
