import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Cap Rate by City in the United States",
  description: "Compare capitalization rates across major U.S. cities to find the best real estate investment markets.",
  keywords: ["cap rate by city", "real estate markets", "investment comparison", "capitalization rate"],
};

export default async function Layout({ children }: { children: ReactNode }) {
  const t = await getServerT();
  return children;
}
