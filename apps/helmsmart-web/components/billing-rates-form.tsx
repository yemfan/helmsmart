"use client";

import { useState, useTransition } from "react";
import { Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import { saveBillingRates } from "@/lib/actions/settings";

function toNum(v: string): number | null {
  const t = v.trim();
  return t && !isNaN(parseFloat(t)) ? parseFloat(t) : null;
}

export function BillingRatesForm({
  hourlyRate,
  laborCostRate,
}: {
  hourlyRate: number | null;
  laborCostRate: number | null;
}) {
  const { t } = useTranslation("settings");
  const [hr, setHr] = useState(hourlyRate?.toString() ?? "");
  const [lc, setLc] = useState(laborCostRate?.toString() ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setError(null);
    start(async () => {
      try {
        const res = await saveBillingRates({ hourlyRate: toNum(hr), laborCostRate: toNum(lc) });
        if (res?.error) { setError(res.error); return; }
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } catch (e) {
        console.error("saving billing rates", e);
        setError(t("common:errors.generic"));
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">{t("financial.rates.hourly")}</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={hr}
              onChange={(e) => setHr(e.target.value)}
              disabled={pending}
              placeholder={t("financial.rates.hourlyPlaceholder")}
              className="w-full text-sm border border-slate-300 rounded-lg pl-7 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
            />
          </div>
          <p className="text-[10px] text-slate-400 mt-1">{t("financial.rates.hourlyHelp")}</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">{t("financial.rates.laborCost")}</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={lc}
              onChange={(e) => setLc(e.target.value)}
              disabled={pending}
              placeholder={t("financial.rates.laborCostPlaceholder")}
              className="w-full text-sm border border-slate-300 rounded-lg pl-7 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
            />
          </div>
          <p className="text-[10px] text-slate-400 mt-1">{t("financial.rates.laborCostHelp")}</p>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={pending}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
        >
          <Save className="w-4 h-4" />
          {pending ? t("actions.saving") : saved ? t("actions.saved") : t("financial.rates.save")}
        </button>
      </div>
      {error && <p className="text-xs text-rose-600 text-right" role="alert">{error}</p>}
    </div>
  );
}
