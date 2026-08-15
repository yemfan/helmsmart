import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

import CoordinatorClient from "./CoordinatorClient";
import { TransactionsViewToggle } from "../TransactionsViewToggle";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.coordinator.metaTitle", { ns: "dashboard" }),
    robots: { index: false },
  };
}

export default function CoordinatorPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Transaction coordinator
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            One column per stage of the deal. Cards show transactions with
            open work at that stage, sorted overdue-first. Click a card to
            jump to the deal.
          </p>
        </div>
        <TransactionsViewToggle current="board" />
      </header>

      <CoordinatorClient />
    </main>
  );
}
