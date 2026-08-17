"use client";

import type { SalesModel } from "@/lib/sales-models";
import { useTranslation } from "react-i18next";

/**
 * Compact identity strip at the top of the sales-model dashboard.
 *
 * The whole block reads from the model config so adding a new model
 * means no UI changes here. We deliberately keep this dense — the
 * page header above already says which model is active, so this
 * surface only needs to anchor "operating mode" without eating real
 * estate. Tone + lead types ride as inline meta rather than their
 * own cards.
 */
export function IdentityBlock({ model }: { model: SalesModel }) {
  const { t } = useTranslation("dashboard");
  return (
    <section
      aria-label={t("pages.salesModelBits.operatingIdentity")}
      className={[
        "relative overflow-hidden rounded-xl border bg-white px-4 py-3 sm:px-5 sm:py-4",
        "ring-1 ring-slate-900/[0.04] shadow-sm",
        "border-slate-200",
      ].join(" ")}
    >
      <div
        aria-hidden
        className={[
          "absolute inset-0 -z-10 opacity-60",
          gradientFor(model.id),
        ].join(" ")}
      />
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-xl shadow-sm ring-1 ring-slate-900/10"
          aria-hidden
        >
          {model.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-slate-900 sm:text-base">
            {model.identityTitle}
            <span className="ml-2 inline-flex items-center rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600 ring-1 ring-slate-200/80">
              {model.label}
            </span>
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-700 sm:text-sm">
            {model.philosophy}
          </p>
          <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <MetaPair label={t("pages.salesModelBits.style")} value={model.tone} />
            <MetaPair label={t("pages.salesModelBits.bestFor")} value={model.leadTypes.join(", ")} />
          </dl>
        </div>
      </div>
    </section>
  );
}

function MetaPair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </dt>
      <dd className="truncate text-slate-700">{value}</dd>
    </div>
  );
}

function gradientFor(id: SalesModel["id"]): string {
  switch (id) {
    case "influencer":
      return "bg-gradient-to-br from-fuchsia-100 via-rose-50 to-amber-50";
    case "closer":
      return "bg-gradient-to-br from-blue-100 via-sky-50 to-slate-100";
    case "advisor":
      return "bg-gradient-to-br from-emerald-100 via-teal-50 to-blue-50";
    case "custom":
      return "bg-gradient-to-br from-slate-100 via-white to-slate-100";
  }
}
