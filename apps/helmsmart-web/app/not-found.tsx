import type { Metadata } from "next";
import Link from "next/link";

import { getServerT } from "@/lib/i18n/server";

/**
 * The 404 a reader actually lands on — a dead link, a stale bookmark, a typo.
 *
 * There was no `not-found.tsx` at all, so Next's built-in shell answered:
 * "404: This page could not be found." in English, under the `<html lang="zh-Hans">`
 * the root layout had just set. A mistyped URL is one of the few pages every
 * visitor sees sooner or later, and it was the only one still in English.
 *
 * `getServerT` reads the locale cookie, which makes this route dynamic — but the
 * root layout already calls `getServerLocale()`, so every route in this app is
 * dynamic already and nothing here changes that.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("site");
  return { title: t("notFound.title") };
}

export default async function NotFound() {
  const t = await getServerT("site");

  return (
    <main
      id="main-content"
      className="min-h-screen flex items-center justify-center p-6"
    >
      <div className="w-full max-w-md text-center">
        <p className="text-5xl font-bold tracking-tight text-slate-300">404</p>
        <h1 className="mt-4 text-xl font-semibold text-slate-900">
          {t("notFound.title")}
        </h1>
        <p className="mt-2 text-sm text-slate-600">{t("notFound.body")}</p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700"
        >
          {t("notFound.backHome")}
        </Link>
      </div>
    </main>
  );
}
