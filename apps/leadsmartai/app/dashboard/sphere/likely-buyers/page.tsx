import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

import LikelyBuyersPanel from "@/components/dashboard/LikelyBuyersPanel";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return { title: `${t("pages.likelyBuyers.metaTitle", { ns: "dashboard" })} | CloseBoss` };
}

/**
 * Daily SOI buyer-prediction surface — the dual of /dashboard/sphere/
 * likely-sellers. Same cohort (past_client + sphere), different scoring
 * (job_change / life_event drive it; listing_activity is excluded).
 *
 * Pure shell — the panel is a client component that fetches
 * /api/dashboard/sphere/likely-buyers.
 */
export default async function LikelyBuyersPage() {
  const t = await getServerT();
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          {t("pages.likelyBuyers.heading", { ns: "dashboard" })}
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          {t("pages.likelyBuyers.intro", { ns: "dashboard" })}
        </p>
      </header>

      <LikelyBuyersPanel defaultLimit={25} />
    </main>
  );
}
