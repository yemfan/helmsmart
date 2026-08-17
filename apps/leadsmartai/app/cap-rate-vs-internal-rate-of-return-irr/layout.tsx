import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Cap Rate vs Internal Rate of Return (IRR)",
  description: "Understand cap rate vs IRR for real estate investments. Compare these metrics to evaluate property returns and performance.",
  keywords: ["cap rate", "IRR", "internal rate of return", "property returns", "real estate"],
};

export default async function CapRateIRRLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
