import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";
import type { ReactNode } from "react";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.opportunities.metaTitle", { ns: "dashboard" }),
    description: t("pages.opportunities.metaDescription", { ns: "dashboard" }),
    robots: { index: false },
  };
}

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
