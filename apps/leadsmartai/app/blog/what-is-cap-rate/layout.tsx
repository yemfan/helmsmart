import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "What Is Cap Rate in Real Estate?",
  description: "A clear explanation of capitalization rate and why it matters for real estate investors.",
  keywords: ["what is cap rate", "capitalization rate", "real estate basics", "investment fundamentals"],
};

export default async function Layout({ children }: { children: ReactNode }) {
  const t = await getServerT();
  return children;
}
