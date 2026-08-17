import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "What Is a Good Cap Rate for Rental Property?",
  description: "Find out what cap rate range to target for rental property investments in todays market.",
  keywords: ["good cap rate", "rental property", "target returns", "investment benchmarks"],
};

export default async function Layout({ children }: { children: ReactNode }) {
  const t = await getServerT();
  return children;
}
