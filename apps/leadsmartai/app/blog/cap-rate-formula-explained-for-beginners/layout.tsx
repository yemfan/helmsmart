import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Cap Rate Formula Explained for Beginners",
  description: "Learn the cap rate formula step by step with clear examples for new real estate investors.",
  keywords: ["cap rate formula", "beginner guide", "NOI", "property value"],
};

export default async function Layout({ children }: { children: ReactNode }) {
  const t = await getServerT();
  return children;
}
