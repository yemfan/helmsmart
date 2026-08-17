"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type Summary = {
  totalContacts: number;
  avgCompletenessScore: number;
  withEmailPct: number;
  withPhonePct: number;
  withBirthdayPct: number;
  withHomePurchaseDatePct: number;
};

export function ContactHealthPanel() {
  const { t } = useTranslation("dashboard");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/contacts/summary", { cache: "no-store" });
        if (res.status === 401 || res.status === 403) {
          // Not admin — hide panel gracefully.
          setSummary(null);
          return;
        }
        const json = (await res.json()) as { success?: boolean; summary?: Summary; error?: string };
        if (!res.ok || !json?.success) {
          setSummary(null);
          return;
        }
        setSummary(json.summary ?? null);
      } catch {
        setSummary(null);
      }
    })();
  }, []);

  if (error) {
    return null;
  }

  if (!summary) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-sm text-slate-500">
        Loading contact health…
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-base font-semibold text-slate-900">{t("pages.contactHealth.heading")}</h2>
        <p className="mt-1 text-xs text-slate-500">{t("pages.contactHealth.fieldCoverage")}</p>
      </div>
      <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
        <Metric label={t("pages.contactHealth.total")} value={String(summary.totalContacts)} />
        <Metric label={t("pages.contactHealth.avgCompleteness")} value={`${summary.avgCompletenessScore}/100`} />
        <Metric label={t("pages.contactHealth.withEmail")} value={`${summary.withEmailPct}%`} />
        <Metric label={t("pages.contactHealth.withPhone")} value={`${summary.withPhonePct}%`} />
        <Metric label={t("pages.contactHealth.withBirthday")} value={`${summary.withBirthdayPct}%`} />
        <Metric label={t("pages.contactHealth.withPurchaseDate")} value={`${summary.withHomePurchaseDatePct}%`} />
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}
