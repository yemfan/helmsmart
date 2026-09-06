"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";
import { AiActionGateBanner } from "@/components/entitlements/AiActionGateBanner";
import {
  detectAiActionGate,
  type AiActionGate,
} from "@/lib/entitlements/aiActionGate";
import type { DealReview } from "@/lib/deal-review/types";

/**
 * AI Deal Review panel. Renders on closed transactions (parent enforces).
 * First open: loads cached review or generates via Claude (~15s).
 * Agent can force-regenerate with the button.
 */

type ReviewResponse = {
  ok: boolean;
  review: DealReview;
  fromCache: boolean;
  usedFallback: boolean;
  aiConfigured: boolean;
  error?: string;
  code?: string;
};

export function DealReviewPanel({ transactionId }: { transactionId: string }) {
  const { t } = useTranslation("dashboard");
  const [resp, setResp] = useState<ReviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Sticky entitlement gate from /api/dashboard/transactions/.../review.
  // Replaces the raw red error string with the shared upgrade banner so
  // the agent sees the same affordance everywhere AI is gated.
  const [gate, setGate] = useState<AiActionGate | null>(null);

  const load = useCallback(
    async (force = false) => {
      setError(null);
      setGate(null);
      if (force) setRegenerating(true);
      else setLoading(true);
      try {
        const res = await fetch(
          `/api/dashboard/transactions/${transactionId}/review`,
          { method: force ? "POST" : "GET" },
        );
        const body = (await res.json().catch(() => null)) as ReviewResponse | null;
        if (!res.ok || !body || !body.ok) {
          const aiGate = detectAiActionGate(res.status, body);
          if (aiGate) {
            setGate(aiGate);
            return;
          }
          setError(body?.error ?? "Couldn't load deal review.");
          return;
        }
        setResp(body);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Network error.");
      } finally {
        setLoading(false);
        setRegenerating(false);
      }
    },
    [transactionId],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t("pages.dealReview.heading")}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">{t("pages.dealReview.intro")}</p>
        </div>
        {resp ? (
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={regenerating || loading}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60"
          >
            {regenerating ? t("common:status.generating") : "↻ Regenerate"}
          </button>
        ) : null}
      </div>

      {loading && !resp ? (
        <div className="mt-6 rounded-lg bg-slate-50 dark:bg-slate-900/60 p-6 text-center text-sm text-slate-500">{t("pages.dealReview.generating")}</div>
      ) : gate ? (
        <AiActionGateBanner reason={gate.reason} className="mt-4" />
      ) : error ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : resp ? (
        <ReviewBody resp={resp} dimmed={regenerating} />
      ) : null}
    </section>
  );
}

function ReviewBody({ resp, dimmed }: { resp: ReviewResponse; dimmed: boolean }) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const { review } = resp;
  return (
    <div className={`mt-4 space-y-4 ${dimmed ? "opacity-60" : ""}`}>
      {/* Headline + summary */}
      <div className="rounded-lg bg-slate-50 dark:bg-slate-900/60 p-4">
        <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {review.headline}
        </div>
        {review.summary ? (
          <p className="mt-1 text-sm text-slate-700 dark:text-slate-300 leading-6">{review.summary}</p>
        ) : null}
        {review.executionScore != null ? (
          <div className="mt-2 inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
            <span className="font-semibold">{t("pages.dealReview.executionScore")}</span>
            <span className="tabular-nums">
              {Math.round(review.executionScore * 100)}
              <span className="text-slate-400"> / 100</span>
            </span>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {review.whatWentWell.length > 0 ? (
          <Section title={t("pages.dealReview.wentWell")} tone="green" items={review.whatWentWell} />
        ) : null}
        {review.whereItStalled.length > 0 ? (
          <Section title={t("pages.dealReview.stalled")} tone="amber" items={review.whereItStalled} />
        ) : null}
        {review.patternObservations.length > 0 ? (
          <Section
            title={t("pages.dealReview.vsOthers")}
            tone="blue"
            items={review.patternObservations}
            wide
          />
        ) : null}
        {review.doDifferentlyNextTime.length > 0 ? (
          <Section
            title={t("pages.dealReview.doDifferently")}
            tone="slate"
            items={review.doDifferentlyNextTime}
            wide
          />
        ) : null}
      </div>

      {/* Footer: provenance + fallback notice */}
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 dark:border-slate-700 pt-3 text-[11px] text-slate-400">
        <span>
          {t("pages.dealReview.generatedAt", { date: new Date(review.generatedAtIso).toLocaleString(locale) })}
          {resp.fromCache ? " (cached)" : ""}
        </span>
        {resp.usedFallback ? (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">{t("pages.dealReview.aiUnavailable")}</span>
        ) : null}
        {!resp.aiConfigured ? (
          <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-medium text-slate-600 dark:text-slate-400">
            Set ANTHROPIC_API_KEY to enable AI commentary
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Section({
  title,
  items,
  tone,
  wide,
}: {
  title: string;
  items: string[];
  tone: "green" | "amber" | "blue" | "slate";
  wide?: boolean;
}) {
  const style = {
    green: "border-green-200 bg-green-50",
    amber: "border-amber-200 bg-amber-50",
    blue: "border-blue-200 bg-blue-50",
    slate: "border-slate-200 bg-white",
  }[tone];
  const labelColor = {
    green: "text-green-800",
    amber: "text-amber-800",
    blue: "text-blue-800",
    slate: "text-slate-800",
  }[tone];
  return (
    <div className={`${wide ? "md:col-span-2" : ""} rounded-lg border p-3 ${style}`}>
      <div className={`text-xs font-semibold ${labelColor}`}>{title}</div>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-800 dark:text-slate-200">
        {items.map((item, i) => (
          <li key={i} className="leading-6">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
