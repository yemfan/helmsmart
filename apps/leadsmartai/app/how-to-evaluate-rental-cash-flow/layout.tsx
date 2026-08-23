import type { Metadata } from "next";
import type { ReactNode } from "react";

import { getServerT } from "@/lib/i18n/server";

/*
 * `how-to-evaluate-rental-cash-flow/page.tsx` is a client component, and a client component cannot
 * export metadata — so this route served the root layout's title, which is the
 * homepage's. A layout is a server component and can, so the title lives here.
 *
 * No brand suffix: the root layout appends one via `template: "%s | CloseBoss AI"`.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.howToRentalCashFlow.title", { ns: "web_marketing" });
  const description = t("routeMeta.howToRentalCashFlow.description", { ns: "web_marketing" });
  return {
    title,
    description,
    alternates: { canonical: "/how-to-evaluate-rental-cash-flow" },
    openGraph: { title, description, url: "/how-to-evaluate-rental-cash-flow", type: "website" },
  };
}

export default function HowToRentalCashFlowLayout({ children }: { children: ReactNode }) {
  return children;
}
