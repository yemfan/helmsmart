"use client";

import { useTranslation } from "react-i18next";

/**
 * Dashboard RSC failures (e.g. DB/RLS). Production still hides the message in the overlay;
 * use Vercel logs + digest, or reproduce with `next dev` / `next build && next start`.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useTranslation("dashboard");
  return (
    <div className="min-h-[40vh] rounded-xl border border-red-200 bg-red-50/80 p-6 text-slate-900 dark:text-slate-100">
      <h2 className="text-lg font-bold text-red-900">{t("pages.dashboardError.title")}</h2>
      <p className="mt-2 text-sm text-red-800/90">
        {process.env.NODE_ENV === "development" && error.message?.trim()
          ? error.message
          : t("pages.error.somethingWentWrongLoading")}
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-xs text-red-700/80">{t("pages.dashFragments.digest")} {error.digest}</p>
      ) : null}
      <button
        type="button"
        onClick={() => reset()}
        className="mt-4 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800"
      >{t("pages.dashboardError.tryAgain")}</button>
    </div>
  );
}
