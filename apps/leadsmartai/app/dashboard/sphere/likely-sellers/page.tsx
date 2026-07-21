import type { Metadata } from "next";

import LikelySellersPanel from "@/components/dashboard/LikelySellersPanel";

export const metadata: Metadata = {
  title: "Today's likely sellers | CloseBoss",
};

/**
 * Daily SOI seller-prediction surface. The panel is a client component that
 * fetches /api/dashboard/sphere/likely-sellers; this page is intentionally
 * minimal so it stays a pure shell — easy to embed inside a future agent
 * dashboard tab without re-doing the fetch / state plumbing.
 */
export default function LikelySellersPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Today&apos;s likely sellers
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Past clients and sphere contacts ranked by likelihood to list in the
          next ~90 days. Scores are rules-based and explainable — every row
          shows the strongest factor driving its rank.
        </p>
      </header>

      <LikelySellersPanel defaultLimit={25} />
    </main>
  );
}
