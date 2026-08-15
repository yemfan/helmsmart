import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

import DealCoachPanel from "@/components/dashboard/DealCoachPanel";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return { title: `${t("pages.dealCoach.metaTitle", { ns: "dashboard" })} | CloseBoss` };
}

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
export default async function DealCoachPage() {
  const t = await getServerT();
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {t("pages.dealCoach.heading", { ns: "dashboard" })}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          {t("pages.dealCoach.intro", { ns: "dashboard" })}
        </p>
      </header>

      <DealCoachPanel />
    </main>
  );
}
