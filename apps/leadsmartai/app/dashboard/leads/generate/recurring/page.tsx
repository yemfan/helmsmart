import type { Metadata } from "next";
import Link from "next/link";

import { getServerT } from "@/lib/i18n/server";

import RecurringListClient from "./RecurringListClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("recurring.metadata.title", { ns: "web_generate_leads" }),
    description: t("recurring.metadata.description", { ns: "web_generate_leads" }),
    robots: { index: false },
  };
}

/**
 * Phase 2D management page for recurring post schedules. The list
 * itself is fetched client-side so pause/resume/cancel can mutate
 * without a server-render dance — same pattern as the scheduled
 * posts page.
 */
export default async function RecurringPostsPage() {
  const t = await getServerT();
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            {t("recurring.title", { ns: "web_generate_leads" })}
          </h1>
          <p className="text-sm text-slate-500">
            {t("recurring.subtitle", { ns: "web_generate_leads" })}
          </p>
        </div>
        <Link
          href="/dashboard/leads/generate"
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          {t("recurring.back", { ns: "web_generate_leads" })}
        </Link>
      </div>
      <RecurringListClient />
    </div>
  );
}
