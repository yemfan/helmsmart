import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Cap Rate Example for Rental Property",
  description: "See a real-world cap rate calculation example for rental property investment analysis.",
  keywords: ["cap rate example", "rental property", "investment calculation", "real estate math"],
};

export default async function Layout({ children }: { children: ReactNode }) {
  const t = await getServerT();
  return children;
}
