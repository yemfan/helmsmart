import type { Metadata } from "next";
import type { ReactNode } from "react";

import { getServerT } from "@/lib/i18n/server";

/*
 * `how-to-analyze-rental-property/page.tsx` is a client component, and a client component cannot
 * export metadata — so this route served the root layout's title, which is the
 * homepage's. A layout is a server component and can, so the title lives here.
 *
 * No brand suffix: the root layout appends one via `template: "%s | CloseBoss AI"`.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.howToAnalyzeRental.title", { ns: "web_marketing" });
  const description = t("routeMeta.howToAnalyzeRental.description", { ns: "web_marketing" });
  return {
    title,
    description,
    alternates: { canonical: "/how-to-analyze-rental-property" },
    openGraph: { title, description, url: "/how-to-analyze-rental-property", type: "website" },
  };
}

export default function HowToAnalyzeRentalLayout({ children }: { children: ReactNode }) {
  return children;
}
