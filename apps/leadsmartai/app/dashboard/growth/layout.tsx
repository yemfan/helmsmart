import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.growth.metaTitle", { ns: "dashboard" }),
    robots: { index: false },
  };
}

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
