import { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Closing Cost Estimator",
  description: "Estimate closing costs for home purchases. Calculate loan origination, title insurance, appraisal, and other buyer fees.",
  keywords: ["closing costs", "home purchase", "loan fees", "title insurance", "real estate"],
};

export default async function ClosingCostEstimatorLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
