import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

import LikelySellersPanel from "@/components/dashboard/LikelySellersPanel";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return { title: `${t("pages.likelySellers.metaTitle", { ns: "dashboard" })} | CloseBoss` };
}

/**
 * Daily SOI seller-prediction surface. The panel is a client component that
 * fetches /api/dashboard/sphere/likely-sellers; this page is intentionally
 * minimal so it stays a pure shell — easy to embed inside a future agent
 * dashboard tab without re-doing the fetch / state plumbing.
 */
export default async function LikelySellersPage() {
  const t = await getServerT();
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {t("pages.likelySellers.heading", { ns: "dashboard" })}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          {t("pages.likelySellers.intro", { ns: "dashboard" })}
        </p>
      </header>

      <LikelySellersPanel defaultLimit={25} />
    </main>
  );
}
