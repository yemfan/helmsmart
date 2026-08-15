import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

import LeadSourceRoiPanel from "@/components/dashboard/LeadSourceRoiPanel";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return { title: `${t("pages.leadSourceRoi.metaTitle", { ns: "dashboard" })} | CloseBoss` };
}

/**
 * Pull-mode dashboard surface answering "which lead sources actually
 * produce revenue?" — the question the gap analysis flagged as the
 * most-asked-by-agents missing report in incumbent CRMs.
 *
 * The panel is a client component that fetches /api/dashboard/
 * lead-source-roi; this page is a thin shell so the surface stays
 * embeddable inside a future dashboard tab without re-doing fetch /
 * state plumbing.
 */
export default async function LeadSourceRoiPage() {
  const t = await getServerT();
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {t("pages.leadSourceRoi.heading", { ns: "dashboard" })}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          {t("pages.leadSourceRoi.intro", { ns: "dashboard" })}
        </p>
      </header>

      <LeadSourceRoiPanel defaultWindowDays={90} />
    </main>
  );
}
