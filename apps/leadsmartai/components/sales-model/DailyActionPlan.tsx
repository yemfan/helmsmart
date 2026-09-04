"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SalesModel } from "@/lib/sales-models";

const STORAGE_KEY_PREFIX = "leadsmart.salesModel.dailyDone.v1";

/**
 * Today's Action Plan — model-specific daily checklist.
 *
 * Tasks come from `model.tasks` so swapping models swaps the plan.
 *
 * The "done" state is persisted to localStorage per-model per-day so
 * checked items survive a page refresh, but reset cleanly the next
 * morning. We deliberately keep this client-side only for MVP — a
 * server-side checklist would be its own table + sync flow, scope
 * creep for the first cut.
 *
 * Storage key shape: `<prefix>:<modelId>:<YYYY-MM-DD>`. The date
 * suffix is what makes it self-resetting — a new day means a fresh
 * empty set under a new key, no cleanup needed.
 */
export function DailyActionPlan({ model }: { model: SalesModel }) {
  const { t } = useTranslation("dashboard");
  const today = todayKey();
  const storageKey = `${STORAGE_KEY_PREFIX}:${model.id}:${today}`;
  const [done, setDone] = useState<Set<number>>(new Set());

  // Hydrate from localStorage on mount + when model/day changes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        setDone(new Set());
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        setDone(new Set(parsed.filter((v): v is number => typeof v === "number")));
      }
    } catch {
      setDone(new Set());
    }
  }, [storageKey]);

  // Persist on every change. Cheap — set is small.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(Array.from(done)));
    } catch {
      // Quota / private window — silently drop.
    }
  }, [storageKey, done]);

  const toggle = (idx: number) => {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const completed = done.size;
  const total = model.tasks.length;

  return (
    <section
      aria-label={t("pages.misc.actionPlanAria")}
      className="rounded-2xl border border-slate-200 bg-white p-6 ring-1 ring-slate-900/[0.04] shadow-sm"
    >
      <header className="flex items-center gap-4">
        <ProgressRing completed={completed} total={total} />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-slate-900">{t("pages.misc.actionPlan")}</h2>
          <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
            {t("pages.dailyActionPlan.completedOf", { completed, total })}
            {total > 0 ? ` · ${Math.round((completed / total) * 100)}%` : ""}
          </p>
        </div>
      </header>

      <ul className="mt-5 space-y-1">
        {model.tasks.map((task, idx) => {
          const isDone = done.has(idx);
          return (
            <li key={`${model.id}-task-${idx}`}>
              <button
                type="button"
                onClick={() => toggle(idx)}
                aria-pressed={isDone}
                className={[
                  "group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition",
                  "min-h-[44px]",
                  isDone ? "bg-emerald-50/60" : "hover:bg-slate-50",
                ].join(" ")}
              >
                <span
                  className={[
                    "flex-1 text-sm",
                    isDone ? "text-slate-500 line-through" : "text-slate-800",
                  ].join(" ")}
                >
                  {task}
                </span>
                <span
                  className={[
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition",
                    isDone
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-slate-300 bg-white text-transparent group-hover:border-slate-400",
                  ].join(" ")}
                  aria-hidden
                >
                  ✓
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Circular SVG progress ring shown in the panel header. Renders the
 * completion fraction as an arc + the "X/N" count in the center.
 *
 * Pure presentational — caller passes the numbers, this just paints.
 * Uses stroke-dasharray to represent progress without runtime layout.
 */
function ProgressRing({
  completed,
  total,
  size = 56,
  stroke = 6,
}: {
  completed: number;
  total: number;
  size?: number;
  stroke?: number;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = total > 0 ? Math.max(0, Math.min(1, completed / total)) : 0;
  const dashOffset = circumference * (1 - ratio);
  const isComplete = total > 0 && completed >= total;

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-slate-100"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className={isComplete ? "text-emerald-500 transition-all" : "text-blue-500 transition-all"}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-semibold tabular-nums text-slate-700">
          {completed}
          <span className="text-slate-400">/{total}</span>
        </span>
      </div>
    </div>
  );
}

function todayKey(): string {
  // Local-time YYYY-MM-DD so the reset feels "midnight in my timezone".
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
