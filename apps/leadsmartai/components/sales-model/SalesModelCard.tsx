"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { SalesModel } from "@/lib/sales-models";

/**
 * One model card on the onboarding screen.
 *
 * Renders the icon, name, "Recommended" pill, description, "Best for"
 * + "Strengths" lists, and a Select button. The button is async-aware
 * — it shows t("common:status.saving") while the parent's onSelect promise resolves
 * so a misclick doesn't trigger a second submit.
 *
 * Selected state is purely visual (the parent owns the choice); we
 * highlight with a brand-blue ring + slightly elevated shadow.
 */
export function SalesModelCard({
  model,
  selected,
  onSelect,
}: {
  model: SalesModel;
  selected?: boolean;
  /** Async to let the parent persist before clearing UI. */
  onSelect: (id: SalesModel["id"]) => Promise<void>;
}) {
  const { t } = useTranslation("dashboard");
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onSelect(model.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={[
        "group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-white p-6 transition",
        "ring-1 ring-slate-900/[0.04] shadow-sm",
        selected
          ? "border-blue-500 ring-2 ring-blue-500/30"
          : "border-slate-200 hover:border-slate-300 hover:shadow-md",
      ].join(" ")}
    >
      {model.recommended ? (
        <span className="absolute right-4 top-4 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-700">{t("pages.salesModelBits.recommended")}</span>
      ) : null}

      <div className="flex items-start gap-3">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-2xl"
          aria-hidden
        >
          {model.emoji}
        </div>
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-slate-900">{model.name}</h3>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            {model.label}
          </p>
        </div>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-slate-600">
        {model.description}
      </p>

      <p className="mt-3 text-xs italic text-slate-500">{t("pages.dashFragments.inspiredBy")} {model.inspiredBy.replace(/^Inspired by\s+/i, "")}.
      </p>

      <div className="mt-5 space-y-3">
        <SectionLabelList label={t("pages.salesModelBits.bestFor")} items={model.bestFor} />
        <SectionLabelList label={t("pages.salesModelBits.strengths")} items={model.strengths} />
      </div>

      <div className="mt-6 flex-1" />

      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        aria-label={t("pages.salesModel.selectAria", { name: model.name })}
        className={[
          "mt-2 inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition",
          "min-h-[44px]",
          selected
            ? "bg-blue-600 text-white hover:bg-blue-700"
            : "bg-slate-900 text-white hover:bg-slate-800",
          busy ? "opacity-70" : "",
        ].join(" ")}
      >
        {busy ? t("common:status.saving") : selected ? t("pages.salesModel.selected") : `Select ${model.name.split(" ")[0]}`}
      </button>
    </div>
  );
}

function SectionLabelList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <ul className="mt-1 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <li
            key={item}
            className="rounded-md bg-slate-50 px-2 py-0.5 text-xs text-slate-700 ring-1 ring-inset ring-slate-200"
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
