import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Down Payment Calculator",
  description: "Calculate required down payment for home purchases. Determine deposit amount, loan size, and PMI with our down payment calculator.",
  keywords: ["down payment calculator", "home purchase", "loan amount", "PMI", "mortgage"],
};

export default async function DownPaymentCalculatorLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getServerT();
  return children;
}
