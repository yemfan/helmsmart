import type { Metadata } from "next";

import LikelyBuyersPanel from "@/components/dashboard/LikelyBuyersPanel";

export const metadata: Metadata = {
  title: "Today's likely buyers | CloseBoss",
};

/**
 * Daily SOI buyer-prediction surface — the dual of /dashboard/sphere/
 * likely-sellers. Same cohort (past_client + sphere), different scoring
 * (job_change / life_event drive it; listing_activity is excluded).
 *
 * Pure shell — the panel is a client component that fetches
 * /api/dashboard/sphere/likely-buyers.
 */
export default function LikelyBuyersPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Today&apos;s likely buyers
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Past clients and sphere contacts ranked by likelihood to BUY their next
          home in the next ~90 days. Scores are rules-based and explainable —
          job-change and life-event signals are the strongest movers.
        </p>
      </header>

      <LikelyBuyersPanel defaultLimit={25} />
    </main>
  );
}
