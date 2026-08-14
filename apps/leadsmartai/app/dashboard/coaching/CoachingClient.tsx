"use client";

import { useTranslation } from "react-i18next";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type InsightSeverity = "info" | "warn" | "crit";

type CoachingInsight = {
  id: string;
  severity: InsightSeverity;
  title: string;
  description: string;
  metric?: { value: string; label: string };
  cta?: { href: string; label: string };
};

type CoachingResponse = {
  ok: boolean;
  insights?: CoachingInsight[];
  generatedAt?: string;
  error?: string;
};

/** Keys, not labels — module scope has no hook. */
const SEVERITY_TONE: Record<InsightSeverity, { ring: string; tag: string; tagKey: string }> = {
  crit: {
    ring: "border-rose-200",
    tag: "bg-rose-100 text-rose-700",
    tagKey: "action",
  },
  warn: {
    ring: "border-amber-200",
    tag: "bg-amber-100 text-amber-800",
    tagKey: "headsUp",
  },
  info: {
    ring: "border-slate-200",
    tag: "bg-emerald-100 text-emerald-700",
    tagKey: "onTrack",
  },
};

function formatGeneratedAt(iso: string | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function CoachingClient() {
  const { t } = useTranslation("dashboard");
  const [insights, setInsights] = useState<CoachingInsight[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  const onDismiss = useCallback(async (insightId: string) => {
    setDismissingId(insightId);
    // Optimistic remove — the server-side filter will agree on the
    // next refresh, but the agent feels the click immediately.
    setInsights((prev) => prev.filter((i) => i.id !== insightId));
    try {
      await fetch("/api/dashboard/coaching/dismiss", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ insightId }),
      });
    } catch {
      // Best-effort — if the network call fails, the optimistic remove
      // still gives the agent the UX they expected for this session.
      // Next refresh re-fetches truth from the server.
    } finally {
      setDismissingId(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/dashboard/coaching", { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as CoachingResponse;
        if (cancelled) return;
        if (!res.ok || data.ok === false) {
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        setInsights(data.insights ?? []);
        setGeneratedAt(data.generatedAt);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t("more.coaching.loadFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <ul className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <li
            key={i}
            className="h-28 animate-pulse rounded-2xl bg-slate-100"
            aria-hidden
          />
        ))}
      </ul>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Couldn&apos;t load coaching insights: {error}
      </div>
    );
  }

  if (insights.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-6 py-12 text-center text-sm text-slate-600">
        <p className="text-base font-semibold text-slate-900">{t("more.coaching.allClear")}</p>
        <p className="mt-1">
          {t("more.coaching.allClearBody")}
        </p>
        {generatedAt ? (
          <p className="mt-3 text-[11px] text-slate-400">
            {t("more.coaching.lastRefreshed", { when: formatGeneratedAt(generatedAt) })}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {insights.map((i) => (
          <li
            key={i.id}
            className={`rounded-2xl border bg-white p-5 shadow-sm ${SEVERITY_TONE[i.severity].ring}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${SEVERITY_TONE[i.severity].tag}`}
                >
                  {t(`more.coaching.severity.${SEVERITY_TONE[i.severity].tagKey}`)}
                </span>
                <h2 className="mt-2 text-base font-semibold text-slate-900">
                  {i.title}
                </h2>
                <p className="mt-1 text-sm text-slate-600">{i.description}</p>
              </div>
              <div className="flex shrink-0 items-start gap-2">
                {i.metric ? (
                  <div className="text-right">
                    <p className="text-2xl font-bold tabular-nums text-slate-900">
                      {i.metric.value}
                    </p>
                    <p className="text-[10px] uppercase tracking-wide text-slate-500">
                      {i.metric.label}
                    </p>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => void onDismiss(i.id)}
                  disabled={dismissingId === i.id}
                  title="Snooze for 7 days"
                  aria-label={`Dismiss ${i.title} for 7 days`}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  ×
                </button>
              </div>
            </div>
            {i.cta ? (
              <div className="mt-3">
                <Link
                  href={i.cta.href}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-slate-700 hover:text-slate-900 hover:underline"
                >
                  {i.cta.label} →
                </Link>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {generatedAt ? (
        <p className="text-[11px] text-slate-400">
          Refreshed {formatGeneratedAt(generatedAt)}
        </p>
      ) : null}
    </div>
  );
}
