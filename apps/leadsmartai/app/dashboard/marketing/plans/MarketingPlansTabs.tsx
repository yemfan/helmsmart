"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import MarketingPlansClient from "./MarketingPlansClient";
import SphereMonetizationPanel from "@/components/dashboard/SphereMonetizationPanel";

/**
 * Marketing Plans page tabs — Plans (automated SMS/email sequences)
 * and Sphere (past clients + sphere ranked by seller/buyer
 * likelihood). Sphere lives here because nurturing and monetizing
 * the sphere is the Marketing Assistant's job; the old
 * /dashboard/sphere/monetization page redirects to this tab.
 */
export default function MarketingPlansTabs({ initialTab }: { initialTab: "plans" | "sphere" }) {
  const { t } = useTranslation("dashboard");
  const [tab, setTab] = useState<"plans" | "sphere">(initialTab);

  return (
    <div>
      <div className="mb-4 flex items-center gap-1 border-b border-slate-200 dark:border-slate-700">
        {(
          [
            { id: "plans", label: "Marketing Plans" },
            { id: "sphere", label: "Sphere" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === t.id
                ? "border-[#0B1F44] text-[#0B1F44]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
            aria-current={tab === t.id ? "page" : undefined}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "plans" ? (
        <MarketingPlansClient />
      ) : (
        <div>
          <header className="mb-5 max-w-2xl">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">{t("pages.marketingPlansTabs.sphereTitle")}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{t("pages.marketingPlansTabs.sphereSub")}</p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs">
              <Link
                href="/dashboard/sphere/likely-sellers"
                className="rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                {t("pages.marketingPlans.sellerView")}
              </Link>
              <Link
                href="/dashboard/sphere/likely-buyers"
                className="rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                {t("pages.marketingPlans.buyerView")}
              </Link>
            </div>
          </header>
          <SphereMonetizationPanel defaultLimitPerSide={100} />
        </div>
      )}
    </div>
  );
}
