"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SalesModelCard } from "@/components/sales-model/SalesModelCard";
import {
  SALES_MODEL_ORDER,
  salesModels,
  type SalesModelId,
} from "@/lib/sales-models";
import { saveSelectedSalesModel } from "@/lib/sales-model-storage";

/**
 * Client wrapper for the onboarding screen — owns the selection
 * state + the persist + redirect on confirm.
 *
 * 4 cards in a responsive grid: 1-up on mobile, 2-up on tablets,
 * 4-up at lg+. The Recommended (Advisor) card is first in
 * SALES_MODEL_ORDER so it gets the prime top-left position.
 */
export function OnboardingClient() {
  const { t } = useTranslation("dashboard");
  const router = useRouter();
  const [picked, setPicked] = useState<SalesModelId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSelect = async (id: SalesModelId) => {
    setError(null);
    setPicked(id);
    const ok = await saveSelectedSalesModel(undefined, id);
    if (!ok) {
      setError(t("pages.salesModelOnboarding.syncWarning"));
    }
    // Either way, advance — the local choice is enough to render
    // the dashboard, and any retry will reconcile next visit.
    router.push("/dashboard/sales-model");
  };

  return (
    <div className="space-y-8">
      <header className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
          {t("pages.salesModelOnboarding.eyebrow")}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 md:text-4xl">
          {t("pages.salesModelOnboarding.heading")}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-slate-600 dark:text-slate-400">
          {t("pages.salesModelOnboarding.intro")}
        </p>
      </header>

      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {SALES_MODEL_ORDER.map((id) => (
          <SalesModelCard
            key={id}
            model={salesModels[id]}
            selected={picked === id}
            onSelect={onSelect}
          />
        ))}
      </div>

      <p className="text-xs text-slate-500">
        {t("pages.salesModelOnboarding.footnote")}
      </p>
    </div>
  );
}
