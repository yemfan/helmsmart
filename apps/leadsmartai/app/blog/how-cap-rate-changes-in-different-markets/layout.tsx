import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "How Cap Rate Changes in Different Markets",
  description: "Explore why cap rates vary across real estate markets and what drives the differences.",
  keywords: ["cap rate by market", "market comparison", "regional cap rates", "real estate trends"],
};

export default async function Layout({ children }: { children: ReactNode }) {
  const t = await getServerT();
  return children;
}
