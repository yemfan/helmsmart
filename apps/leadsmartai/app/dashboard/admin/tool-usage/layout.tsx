import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.toolUsage.metaTitle", { ns: "dashboard" }),
    robots: { index: false },
  };
}
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
