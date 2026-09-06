import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";
import Link from "next/link";
import { Activity } from "lucide-react";
import SchedulerActivityClient from "@/components/dashboard/SchedulerActivityClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.schedulerActivity.metaTitle", { ns: "dashboard" }),
    description: t("pages.schedulerActivity.metaDescription", { ns: "dashboard" }),
    robots: { index: false },
  };
}

export default async function SchedulerActivityPage() {
  const t = await getServerT();
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-md shadow-slate-900/15">
            <Activity className="h-5 w-5" strokeWidth={2} aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {t("pages.schedulerActivity.heading", { ns: "dashboard" })}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {t("pages.schedulerActivity.intro", { ns: "dashboard" })}
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/drafts"
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          {t("pages.schedulerActivity.backToDrafts", { ns: "dashboard" })}
        </Link>
      </div>

      <SchedulerActivityClient />
    </div>
  );
}
