"use client";

import { useTranslation } from "react-i18next";

/**
 * "Every plan includes everything" — the capability list, shown once.
 *
 * Deliberately NOT a per-tier bullet list. Under the usage model the tiers
 * differ only by credit volume, so three identical feature lists on three cards
 * would bury the one thing that actually varies, and would read like the old
 * feature-gated ladder we moved off. Saying it once, next to the cards, is both
 * shorter and more accurate.
 *
 * Shared by the public `/plans` page and the in-app credits page so the promise
 * a customer reads before buying is the same one they read after.
 */
export default function IncludedFeatures({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation("web_plans");
  // returnObjects gives the array; the cast is needed because the i18next types
  // widen it to string | object.
  const items = t("included.items", { returnObjects: true }) as unknown as string[];
  const list = Array.isArray(items) ? items : [];

  return (
    <section
      className={
        compact
          ? "rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
          : "rounded-3xl border border-gray-200 bg-white p-6 shadow-sm"
      }
    >
      <h2 className={compact ? "text-lg font-bold text-gray-900" : "text-xl font-semibold text-gray-900"}>
        {t("included.heading")}
      </h2>
      <p className="mt-1 text-sm text-gray-500">{t("included.help")}</p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((item) => (
          <li
            key={item}
            className="flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs leading-5 text-gray-700"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#16a34a"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mt-0.5 shrink-0"
              aria-hidden
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
