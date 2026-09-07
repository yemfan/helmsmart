"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import EquityMessageDraftModal from "@/components/dashboard/EquityMessageDraftModal";
import type {
  SphereSellerFactor,
  SphereSellerLabel,
} from "@/lib/spherePrediction/types";

type LikelySellerRow = {
  contactId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  lifecycleStage: "past_client" | "sphere";
  closingAddress: string | null;
  closingDate: string | null;
  score: number;
  label: SphereSellerLabel;
  topReason: string;
  factors: SphereSellerFactor[];
};

type LabelFilter = "all" | SphereSellerLabel;

const LABEL_TONE: Record<SphereSellerLabel, string> = {
  high: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  medium: "bg-amber-50 text-amber-700 ring-amber-200",
  low: "bg-slate-50 text-slate-600 ring-slate-200",
};

const FILTERS: { value: LabelFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

/**
 * "Today's likely sellers" — agent-side panel ranking past_client + sphere
 * contacts by SOI seller-prediction score. Each row shows the top reason
 * (the highest-pointEarned factor), so the agent reads a one-liner like
 * "Owned ~7.2y — peak sell window." and can act immediately.
 *
 * Click a row → contact profile. Future: an inline "AI-draft equity-update
 * message" CTA that re-uses the factor breakdown for the prompt.
 */
export default function LikelySellersPanel(props: { defaultLimit?: number } = {}) {
  const { t } = useTranslation("dashboard");
  const limit = props.defaultLimit ?? 25;

  const [rows, setRows] = useState<LikelySellerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<LabelFilter>("all");
  const [draftFor, setDraftFor] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/dashboard/sphere/likely-sellers?limit=${limit}`,
          { cache: "no-store" },
        );
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          sellers?: LikelySellerRow[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || data.ok === false) {
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        setRows(data.sellers ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [limit]);

  const filtered = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => r.label === filter)),
    [rows, filter],
  );

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
      <header className="flex flex-col gap-3 border-b border-slate-100 dark:border-slate-700 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t("pages.misc.likelySellers")}</h2>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
            Past clients + sphere ranked by likelihood to list in the next ~90 days. Click a row for the full factor breakdown.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 transition ${
                filter === f.value
                  ? "bg-slate-900 text-white ring-slate-900"
                  : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 ring-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </header>

      <div className="p-3 sm:p-4">
        {loading ? (
          <ul className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <li
                key={i}
                className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800"
                aria-hidden
              />
            ))}
          </ul>
        ) : error ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{t("pages.dashFragments.couldntLoadSellers")} {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 px-4 py-6 text-center text-sm text-slate-600 dark:text-slate-400">
            {rows.length === 0
              ? t("pages.likelySellers.noPastClientsOr")
              : `No ${filter} candidates. Try a different filter.`}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((r) => (
              <li
                key={r.contactId}
                className="flex items-center gap-3 rounded-xl px-2 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 sm:gap-4"
              >
                <Link
                  href={`/dashboard/contacts/${encodeURIComponent(r.contactId)}`}
                  className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4"
                >
                  <ScoreBadge score={r.score} label={r.label} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {r.fullName}
                      </p>
                      <LifecyclePill stage={r.lifecycleStage} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-600 dark:text-slate-400">{r.topReason}</p>
                    {r.closingAddress ? (
                      <p className="mt-0.5 truncate text-[11px] text-slate-500">
                        {r.closingAddress}
                      </p>
                    ) : null}
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => setDraftFor({ id: r.contactId, name: r.fullName })}
                  className="shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >{t("pages.misc.draftMessage")}</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <EquityMessageDraftModal
        open={draftFor !== null}
        contactId={draftFor?.id ?? null}
        contactName={draftFor?.name ?? null}
        onClose={() => setDraftFor(null)}
      />
    </section>
  );
}

function ScoreBadge({ score, label }: { score: number; label: SphereSellerLabel }) {
  return (
    <div
      className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl ring-1 ${LABEL_TONE[label]}`}
      aria-label={`${label} likelihood, score ${score}`}
    >
      <span className="text-base font-bold leading-none tabular-nums">{score}</span>
      <span className="mt-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide">
        {label}
      </span>
    </div>
  );
}

function LifecyclePill({ stage }: { stage: "past_client" | "sphere" }) {
  const copy = stage === "past_client" ? "Past client" : "Sphere";
  return (
    <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
      {copy}
    </span>
  );
}
