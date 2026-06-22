import type { Metadata } from "next";

import DeepReportClient from "./DeepReportClient";

export const metadata: Metadata = {
  title: "Property Deep Report | RealtorBoss",
};

/**
 * Property Deep Report — a comprehensive buyer-decision report from just an
 * address + intended use: value + comps, loan affordability, an AI deal
 * rating, investment ROI (for rentals), schools, neighborhood, a location
 * map, and the agent's profile.
 */
export default function DeepReportPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Property Deep Report</h1>
        <p className="mt-2 text-sm text-slate-600">
          Everything a buyer needs to decide — value, loan affordability, a
          deal rating, investment returns, schools, neighborhood, and a
          location map — from an address and how they plan to use it.
        </p>
      </header>
      <DeepReportClient />
    </main>
  );
}
