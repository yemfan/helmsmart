import type { Metadata } from "next";

import DealCoachPanel from "@/components/dashboard/DealCoachPanel";

export const metadata: Metadata = {
  title: "AI Deal Coach | CloseBoss",
};

/**
 * Per-deal AI Coach surface — the agent's "what should I do next on this
 * deal?" tool. Pulls together the existing offer-strategy / risk /
 * negotiation libraries plus a prioritized action plan into one unified
 * report.
 *
 * v1: form-driven (agent enters the deal context). Future PR will hydrate
 * the form from a real `offers/{id}` row when embedded in the offer-detail
 * page.
 */
export default function DealCoachPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          AI Deal Coach
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Tell the coach where you are on the deal and what you know about the
          property. It returns a prioritized action plan, pricing strategy,
          risk pillars, and negotiation scripts — coherent with each other,
          all in one place.
        </p>
      </header>

      <DealCoachPanel />
    </main>
  );
}
