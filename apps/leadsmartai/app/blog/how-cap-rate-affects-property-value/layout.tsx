import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "How Cap Rate Affects Property Value",
  description: "Learn the inverse relationship between cap rates and property values in real estate investing.",
  keywords: ["cap rate property value", "valuation", "inverse relationship", "real estate pricing"],
};

export default async function Layout({ children }: { children: ReactNode }) {
  const t = await getServerT();
  return children;
}
