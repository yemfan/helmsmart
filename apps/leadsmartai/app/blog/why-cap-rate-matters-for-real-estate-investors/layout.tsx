import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Why Cap Rate Matters for Real Estate Investors",
  description: "Understand why cap rate is one of the most important metrics for evaluating investment properties.",
  keywords: ["why cap rate matters", "investment metrics", "real estate analysis", "property evaluation"],
};

export default async function Layout({ children }: { children: ReactNode }) {
  const t = await getServerT();
  return children;
}
