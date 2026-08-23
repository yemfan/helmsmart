import type { Metadata } from "next";
import type { ReactNode } from "react";

import { getServerT } from "@/lib/i18n/server";

/*
 * `deal-assistant/page.tsx` is a client component, and a client component cannot
 * export metadata — so this route served the root layout's title, which is the
 * homepage's. A layout is a server component and can, so the title lives here.
 *
 * No brand suffix: the root layout appends one via `template: "%s | CloseBoss AI"`.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.dealAssistant.title", { ns: "web_marketing" });
  const description = t("routeMeta.dealAssistant.description", { ns: "web_marketing" });
  return {
    title,
    description,
    alternates: { canonical: "/deal-assistant" },
    openGraph: { title, description, url: "/deal-assistant", type: "website" },
  };
}

export default function DealAssistantLayout({ children }: { children: ReactNode }) {
  return children;
}
