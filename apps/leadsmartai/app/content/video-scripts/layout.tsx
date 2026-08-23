import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.videoScripts.title", { ns: "web_marketing" });
  const description = t("routeMeta.videoScripts.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: ["video scripts", "marketing", "content"],
  robots: { index: false },
};
}

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
