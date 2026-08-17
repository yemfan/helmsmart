import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "How Banks Use Cap Rate to Value Property",
  description: "Discover how lenders and banks use capitalization rates to appraise commercial real estate.",
  keywords: ["banks cap rate", "property valuation", "commercial appraisal", "lending"],
};

export default async function Layout({ children }: { children: ReactNode }) {
  const t = await getServerT();
  return children;
}
