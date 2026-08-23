"use client";

import { useTranslation } from "react-i18next";

/**
 * The Calculate button on the tool pages.
 *
 * These calculators recompute as you type, so the button had nothing to do —
 * it was a bare `type="button"` with no handler on twelve public pages, which
 * is worse than having no button at all: a control that visibly does nothing
 * reads as broken software.
 *
 * Removing it would have been the other option, but the affordance is worth
 * keeping. On a phone the inputs fill the screen and the results sit below the
 * fold, so "Calculate" now takes you to the answer. On desktop the results are
 * already in view in a sticky column and the scroll is a no-op, which is the
 * correct amount of nothing to do.
 */
export default function CalculateButton() {
  const { t } = useTranslation("dashboard");
  return (
    <button
      type="button"
      onClick={() => {
        document
          .querySelector("[data-calc-results]")
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }}
      className="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
    >
      {t("pages.articleChrome.calculate")}
    </button>
  );
}
