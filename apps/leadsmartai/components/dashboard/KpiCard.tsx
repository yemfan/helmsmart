"use client";

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

type KpiCardProps = {
  label: string;
  value: string;
  subtext?: string;
  trend?: ReactNode;
  /** % change vs the previous period. null = no comparable baseline (hide the badge). */
  deltaPct?: number | null;
  /** Daily series for a mini sparkline. Needs at least 2 points to render. */
  spark?: number[];
  className?: string;
};

function Sparkline({ points }: { points: number[] }) {
  const w = 72;
  const h = 22;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const d = points
    .map((p, i) => `${(i * step).toFixed(1)},${(h - ((p - min) / span) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="shrink-0 self-center text-slate-300"
      fill="none"
      preserveAspectRatio="none"
      aria-hidden
    >
      <polyline
        points={d}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function KpiCard({ label, value, subtext, trend, deltaPct, spark, className }: KpiCardProps) {
  const { t } = useTranslation("dashboard");
  const hasDelta = deltaPct != null && Number.isFinite(deltaPct);
  const up = (deltaPct ?? 0) >= 0;
  const hasSpark = Array.isArray(spark) && spark.length > 1;

  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] ring-1 ring-slate-900/[0.03]",
        className
      )}
    >
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <div className="text-2xl font-semibold tracking-tight text-slate-900">{value}</div>
        {trend ? (
          <div className="shrink-0 text-xs font-medium text-emerald-600">{trend}</div>
        ) : hasSpark ? (
          <Sparkline points={spark as number[]} />
        ) : null}
      </div>
      {hasDelta ? (
        <div
          className={cn(
            "mt-1 inline-flex items-center gap-1 text-xs font-medium",
            up ? "text-emerald-600" : "text-red-600"
          )}
        >
          <span aria-hidden>{up ? "▲" : "▼"}</span>
          <span>{Math.abs(deltaPct as number).toFixed(0)}%</span>
          <span className="font-normal text-slate-400">{t("pages.misc.vsPrevPeriod")}</span>
        </div>
      ) : subtext ? (
        <div className="mt-1 text-xs text-slate-400">{subtext}</div>
      ) : null}
    </div>
  );
}
