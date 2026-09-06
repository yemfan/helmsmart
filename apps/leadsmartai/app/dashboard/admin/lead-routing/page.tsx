import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";
import Link from "next/link";

import LeadRoutingAdminClient from "./LeadRoutingAdminClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.leadRouting.metaTitle", { ns: "dashboard" }),
    robots: { index: false },
  };
}

export default async function LeadRoutingAdminPage() {
  const t = await getServerT();
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{t("pages.leadRouting.title", { ns: "dashboard" })}</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{t("pages.leadRouting.sub", { ns: "dashboard" })}</p>
        <p className="mt-3 text-xs text-slate-500">
          {t("pages.leadRouting.editsOn", { ns: "dashboard" })}{" "}
          <Link
            href="/dashboard/settings"
            className="font-semibold text-slate-700 dark:text-slate-300 underline hover:text-slate-900"
          >{t("pages.leadRouting.settingsPage", { ns: "dashboard" })}</Link>
          .
        </p>
      </header>

      <LeadRoutingAdminClient />
    </main>
  );
}
