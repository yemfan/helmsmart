import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Cap Rate vs IRR",
  description: "Learn when to use cap rate versus internal rate of return for real estate investment decisions.",
  keywords: ["cap rate vs IRR", "internal rate of return", "investment comparison", "real estate metrics"],
};

export default async function Layout({ children }: { children: ReactNode }) {
  const t = await getServerT();
  return children;
}
