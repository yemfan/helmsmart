import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

import CmaListClient from "./CmaListClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.cma.metaTitle", { ns: "dashboard" }),
  };
}

/**
 * Listing-side surface — agent's saved CMAs + a "generate new" form.
 * Heavy lifting (subject lookup, comp pipeline, valuation engine)
 * runs on the propertytoolsai side via /api/dashboard/cma → fetchSmartCma.
 * This page is just the CRM-side persistence + presentation layer.
 */
export default async function CmaPage() {
  const t = await getServerT();
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t("pages.cmaPage.title", { ns: "dashboard" })}</h1>
        <p className="mt-2 text-sm text-slate-600">{t("pages.cmaPage.sub", { ns: "dashboard" })}</p>
      </header>

      <CmaListClient />
    </main>
  );
}
