import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Cap Rate Mistakes Real Estate Investors Make",
  description: "Avoid these common cap rate calculation mistakes that cost real estate investors money.",
  keywords: ["cap rate mistakes", "investor errors", "real estate pitfalls", "investment tips"],
};

export default async function Layout({ children }: { children: ReactNode }) {
  const t = await getServerT();
  return children;
}
