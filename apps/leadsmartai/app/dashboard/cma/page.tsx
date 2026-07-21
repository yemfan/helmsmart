import type { Metadata } from "next";

import CmaListClient from "./CmaListClient";

export const metadata: Metadata = {
  title: "CMA Reports | CloseBoss",
};

/**
 * Listing-side surface — agent's saved CMAs + a "generate new" form.
 * Heavy lifting (subject lookup, comp pipeline, valuation engine)
 * runs on the propertytoolsai side via /api/dashboard/cma → fetchSmartCma.
 * This page is just the CRM-side persistence + presentation layer.
 */
export default function CmaPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Comparative Market Analysis
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Pull comps, run a value range, and save the snapshot for the seller. The valuation engine + comps come from the property-data side; this view stores and presents them per agent.
        </p>
      </header>

      <CmaListClient />
    </main>
  );
}
