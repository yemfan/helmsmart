import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.propertyDetails.title", { ns: "web_marketing" });
  const description = t("routeMeta.propertyDetails.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: ["property", "real estate", "listing"],
  robots: { index: false },
};
}

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
