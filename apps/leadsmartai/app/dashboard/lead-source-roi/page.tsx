import type { Metadata } from "next";

import LeadSourceRoiPanel from "@/components/dashboard/LeadSourceRoiPanel";

export const metadata: Metadata = {
  title: "Lead-source ROI | RealtyBoss",
};

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
export default function LeadSourceRoiPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Lead-source ROI
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Which channels are actually producing revenue. Cohort: contacts you
          captured in the window. &quot;Closes&quot; tracks contacts whose lifecycle
          reached past_client; revenue sums their closing prices.
        </p>
      </header>

      <LeadSourceRoiPanel defaultWindowDays={90} />
    </main>
  );
}
