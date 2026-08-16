"use client";

import { useTranslation } from "react-i18next";

export default function CalculatorError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useTranslation("dashboard");
  return (
    <div className="mx-auto max-w-xl py-16 px-4 text-center">
      <h2 className="text-xl font-semibold text-gray-900 mb-2">{t("pages.articleChrome.somethingWrong")}</h2>
      <p className="text-gray-600 mb-6">{t("pages.articleChrome.calcError")}</p>
      <button
        onClick={reset}
        className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
      >{t("pages.articleChrome.tryAgain")}</button>
    </div>
  );
}
