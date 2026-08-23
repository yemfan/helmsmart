import type { Metadata } from "next";
import type { ReactNode } from "react";

import { getServerT } from "@/lib/i18n/server";

/*
 * `ai-cma-analyzer/page.tsx` is a client component, and a client component cannot
 * export metadata — so this route served the root layout's title, which is the
 * homepage's. A layout is a server component and can, so the title lives here.
 *
 * No brand suffix: the root layout appends one via `template: "%s | CloseBoss AI"`.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.aiCmaAnalyzer.title", { ns: "web_marketing" });
  const description = t("routeMeta.aiCmaAnalyzer.description", { ns: "web_marketing" });
  return {
    title,
    description,
    alternates: { canonical: "/ai-cma-analyzer" },
    openGraph: { title, description, url: "/ai-cma-analyzer", type: "website" },
  };
}

export default function AiCmaAnalyzerLayout({ children }: { children: ReactNode }) {
  return children;
}
