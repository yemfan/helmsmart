import type { Metadata } from "next";
import type { ReactNode } from "react";

import { getServerT } from "@/lib/i18n/server";

/*
 * `agent-home-value-leads/page.tsx` is a client component, and a client component cannot
 * export metadata — so this route served the root layout's title, which is the
 * homepage's. A layout is a server component and can, so the title lives here.
 *
 * No brand suffix: the root layout appends one via `template: "%s | CloseBoss AI"`.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.agentHomeValueLeads.title", { ns: "web_marketing" });
  const description = t("routeMeta.agentHomeValueLeads.description", { ns: "web_marketing" });
  return {
    title,
    description,
    alternates: { canonical: "/agent-home-value-leads" },
    openGraph: { title, description, url: "/agent-home-value-leads", type: "website" },
  };
}

export default function AgentHomeValueLeadsLayout({ children }: { children: ReactNode }) {
  return children;
}
