import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

import DeepReportClient from "./DeepReportClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.deepReport.metaTitle", { ns: "dashboard" }),
  };
}

/**
 * Property Deep Report — a comprehensive buyer-decision report from just an
 * address + intended use: value + comps, loan affordability, an AI deal
 * rating, investment ROI (for rentals), schools, neighborhood, a location
 * map, and the agent's profile.
 */
export default async function DeepReportPage() {
  const t = await getServerT();
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{t("pages.deepReport.heading", { ns: "dashboard" })}</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{t("pages.deepReport.pageSub", { ns: "dashboard" })}</p>
      </header>
      <DeepReportClient />
    </main>
  );
}
