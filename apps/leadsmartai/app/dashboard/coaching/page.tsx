import type { Metadata } from "next";

import CoachingClient from "./CoachingClient";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("pages.dashboardTitles.coaching", { ns: "dashboard" });
  return {
  title,
  robots: { index: false },
};
}

export default async function CoachingPage() {
  const t = await getServerT();
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6 max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{t("pages.coachingPage.title", { ns: "dashboard" })}</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{t("pages.coachingPage.sub", { ns: "dashboard" })}</p>
      </header>

      <CoachingClient />
    </main>
  );
}
