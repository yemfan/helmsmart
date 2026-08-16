import type { Metadata } from "next";

import HouseSearchClient from "./HouseSearchClient";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "AI House Search | CloseBoss",
};

/**
 * Buyer-side AI House Search — describe what a buyer wants in plain
 * English; Claude + live web search returns real matching listings with
 * source links, suggested refinements, and a one-click "email to buyer".
 */
export default async function HouseSearchPage() {
  const t = await getServerT();
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t("pages.houseSearchPage.title", { ns: "dashboard" })}</h1>
        <p className="mt-2 text-sm text-slate-600">{t("pages.houseSearchPage.sub", { ns: "dashboard" })}</p>
      </header>

      <HouseSearchClient />
    </main>
  );
}
