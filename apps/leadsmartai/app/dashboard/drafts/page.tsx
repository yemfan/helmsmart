import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";
import Link from "next/link";
import { Activity, Inbox } from "lucide-react";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { countPendingDrafts } from "@/lib/drafts/service";
import DraftsClient from "@/components/dashboard/DraftsClient";
import RunSchedulerButton from "@/components/dashboard/RunSchedulerButton";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.drafts.metaTitle", { ns: "dashboard" }),
    description: t("pages.drafts.metaDescription", { ns: "dashboard" }),
    robots: { index: false },
  };
}

export default async function DraftsPage() {
  const t = await getServerT();
  const { agentId } = await getCurrentAgentContext();
  const pending = await countPendingDrafts(agentId);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 shadow-md shadow-amber-100/40">
            <Inbox className="h-5 w-5" strokeWidth={2} aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              {t("pages.drafts.heading", { ns: "dashboard" })}
              {pending > 0 && (
                <span className="ml-3 rounded-full bg-amber-100 px-2.5 py-0.5 align-middle text-xs font-semibold text-amber-800">
                  {t("pages.drafts.pending", { ns: "dashboard", count: pending })}
                </span>
              )}
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {t("pages.drafts.intro", { ns: "dashboard" })}
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/drafts/activity"
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <Activity className="h-4 w-4" aria-hidden />
          {t("pages.drafts.activityLog", { ns: "dashboard" })}
        </Link>
      </div>

      <RunSchedulerButton />

      <DraftsClient />
    </div>
  );
}
