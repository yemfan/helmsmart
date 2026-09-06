"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type UsageData = {
  planType: string;
  limits: { maxLeads: number; maxContacts: number; cmaPerDay: number };
  usage: { leads: number; contacts: number; cmaToday: number };
};

function MeterBar({ used, max, label }: { used: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(Math.round((used / max) * 100), 100) : 0;
  const nearLimit = pct >= 80;
  const atLimit = pct >= 100;

  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="font-medium text-slate-700">{label}</span>
        <span className={atLimit ? "text-red-600 font-semibold" : nearLimit ? "text-amber-600" : "text-slate-500"}>
          {used} / {max}
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            atLimit ? "bg-red-500" : nearLimit ? "bg-amber-400" : "bg-blue-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function UsageMeter() {
  const { t } = useTranslation("dashboard");
  const [data, setData] = useState<UsageData | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/usage")
      .then((r) => r.json())
      .then((b) => { if (b.ok) setData(b); })
      .catch(() => {});
  }, []);

  if (!data) return null;

  const { limits, usage, planType } = data;
  const anyNearLimit =
    (usage.leads / limits.maxLeads) >= 0.8 ||
    (usage.contacts / limits.maxContacts) >= 0.8;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("pages.usageMeter.title")}</h3>
        <span className="text-[10px] font-semibold text-slate-400 uppercase bg-slate-100 px-2 py-0.5 rounded">
          {planType}
        </span>
      </div>

      <MeterBar used={usage.leads} max={limits.maxLeads} label={t("pages.usageMeter.leads")} />
      <MeterBar used={usage.contacts} max={limits.maxContacts} label={t("pages.usageMeter.contacts")} />
      <MeterBar used={usage.cmaToday} max={limits.cmaPerDay} label={t("pages.usageMeter.cmaToday")} />

      {anyNearLimit && planType === "free" && (
        <Link
          href="/dashboard/billing"
          className="block text-center rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
        >{t("pages.usageMeter.upgrade")}</Link>
      )}
    </div>
  );
}
