import type { Metadata } from "next";

import HouseSearchClient from "./HouseSearchClient";

export const metadata: Metadata = {
  title: "AI House Search | CloseBoss",
};

/**
 * Buyer-side AI House Search — describe what a buyer wants in plain
 * English; Claude + live web search returns real matching listings with
 * source links, suggested refinements, and a one-click "email to buyer".
 */
export default function HouseSearchPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          AI House Search
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Describe what your buyer is looking for in plain English. The
          assistant searches the web for real, current listings, suggests
          ways to narrow the results, and lets you email the best matches
          straight to your buyer.
        </p>
      </header>

      <HouseSearchClient />
    </main>
  );
}
