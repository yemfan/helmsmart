import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.about.title", { ns: "web_marketing" });
  const description = t("routeMeta.about.description", { ns: "web_marketing" });
  return {
  title,
  description,
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    title,
    description,
  },
};
}

export default function AboutLayout({ children }: { children: ReactNode }) {
  return children;
}
