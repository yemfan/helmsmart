"use client";

import { useTranslation } from "react-i18next";

/**
 * Last-resort UI when the root layout fails. Must define its own <html> / <body>.
 * @see https://nextjs.org/docs/app/building-your-application/routing/error-handling
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useTranslation("dashboard");
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 px-4 py-16 font-sans text-slate-900">
        <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
          <h1 className="text-xl font-bold">CloseBoss — can&apos;t load this page</h1>
          <p className="mt-3 text-sm text-slate-600">
            {error.message?.trim()
              ? error.message
              : "Please refresh or try again in a few minutes. If it keeps happening, contact support."}
          </p>
          {error.digest ? <p className="mt-2 font-mono text-xs text-slate-400">Ref: {error.digest}</p> : null}
          <button
            type="button"
            onClick={() => reset()}
            className="mt-6 w-full rounded-xl bg-[#0072ce] px-4 py-3 text-sm font-semibold text-white hover:bg-[#005ca8]"
          >{t("pages.articleChrome.tryAgain")}</button>
        </div>
      </body>
    </html>
  );
}
