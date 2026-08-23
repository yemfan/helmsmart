"use client";

import { useTranslation } from "react-i18next";

/**
 * Catches client-side render errors in this route segment tree (still inside root layout).
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useTranslation("dashboard");
  return (
    <div className="min-h-[50vh] bg-slate-50 px-4 py-16 text-slate-900">
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
        <h1 className="font-heading text-xl font-bold text-slate-900">{t("pages.articleChrome.somethingWrong")}</h1>
        <p className="mt-3 text-sm text-slate-600">
          {error.message?.trim()
            ? error.message
            : t("pages.error.aClientErrorOccurred")}
        </p>
        {error.digest ? <p className="mt-2 font-mono text-xs text-slate-400">{t("pages.dashFragments.ref")} {error.digest}</p> : null}
        <button
          type="button"
          onClick={() => reset()}
          className="mt-6 w-full rounded-xl bg-[#0072ce] px-4 py-3 text-sm font-semibold text-white hover:bg-[#005ca8]"
        >{t("pages.articleChrome.tryAgain")}</button>
      </div>
    </div>
  );
}
