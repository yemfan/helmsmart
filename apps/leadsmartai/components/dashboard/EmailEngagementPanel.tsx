"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Email engagement card for the performance dashboard.
 *
 * Reads `/api/email-tracking/stats` (data foundation in #188) and
 * renders sent / opened / clicked + open and click-through rates.
 *
 * Three states:
 *   - loading: muted skeleton
 *   - empty (sent === 0): "no email activity yet" zero-state with
 *     a hint about how to start sending so the card is informative
 *     even before the agent's used the email layer
 *   - has-data: numbers + rates
 */

type EmailStats = {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  openRate: number;
  clickThroughRate: number;
};

export function EmailEngagementPanel() {
  const { t } = useTranslation("dashboard");
  const [stats, setStats] = useState<EmailStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/email-tracking/stats?days=${days}`)
      .then((r) => r.json())
      .then((j: { ok: boolean; stats: EmailStats }) => {
        if (cancelled) return;
        setStats(j.stats);
      })
      .catch(() => {
        if (!cancelled) setStats(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 ring-1 ring-slate-900/[0.04] dark:ring-slate-100/10 shadow-sm">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t("pages.emailEngagement.title")}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{t("pages.emailEngagement.windowSubtitle", { days })}
          </p>
        </div>
        <RangeSelect value={days} onChange={setDays} />
      </header>

      {loading ? (
        <SkeletonRow />
      ) : !stats || stats.sent === 0 ? (
        <EmptyState />
      ) : (
        <Stats stats={stats} />
      )}
    </section>
  );
}

function Stats({ stats }: { stats: EmailStats }) {
  const { t } = useTranslation("dashboard");
  return (
    <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Stat label={t("pages.emailEngagement.sent")} value={stats.sent} tone="default" />
      <Stat
        label={t("pages.emailEngagement.openRate")}
        value={formatPercent(stats.openRate)}
        sub={`${stats.opened} opened`}
        tone="primary"
      />
      <Stat
        label={t("pages.emailEngagement.clickThrough")}
        value={formatPercent(stats.clickThroughRate)}
        sub={`${stats.clicked} clicked`}
        tone="primary"
      />
      <Stat
        label={t("pages.emailEngagement.bounced")}
        value={stats.bounced}
        tone={stats.bounced > 0 ? "warn" : "default"}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number | string;
  sub?: string;
  tone: "default" | "primary" | "warn";
}) {
  const valueColor =
    tone === "primary"
      ? "text-blue-700"
      : tone === "warn"
        ? "text-amber-700"
        : "text-slate-900";
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${valueColor}`}>
        {value}
      </p>
      {sub ? <p className="mt-0.5 text-xs text-slate-500">{sub}</p> : null}
    </div>
  );
}

function EmptyState() {
  const { t } = useTranslation("dashboard");
  return (
    <div className="mt-5 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 p-5 text-center">
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{t("pages.emailEngagement.empty")}</p>
      <p className="mt-1 text-xs text-slate-500">{t("pages.emailEngagement.emptyHint")}</p>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i}>
          <div className="h-3 w-16 animate-pulse rounded bg-slate-200" />
          <div className="mt-2 h-7 w-12 animate-pulse rounded bg-slate-200" />
          <div className="mt-1 h-3 w-20 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        </div>
      ))}
    </div>
  );
}

function RangeSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const { t } = useTranslation("dashboard");
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      aria-label={t("pages.emailEngagement.timeRange")}
    >
      <option value={7}>7d</option>
      <option value={30}>30d</option>
      <option value={90}>90d</option>
    </select>
  );
}

function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio === 0) return "0%";
  return `${Math.round(ratio * 100)}%`;
}
