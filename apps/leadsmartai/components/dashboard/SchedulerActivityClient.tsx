"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";
import Link from "next/link";
import type { FiringOutcomeFilter, FiringRange, FiringRow } from "@/lib/scheduler/firings";
import { LoadingText } from "@/components/ui/LoadingText";

type DisplayRow = FiringRow & { contactInitials?: string };

const OUTCOME_OPTIONS: { value: FiringOutcomeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "created", label: "Created" },
  { value: "suppressed", label: "Suppressed (any)" },
  { value: "suppressed_opt_in", label: "Opt-in missing" },
  { value: "suppressed_agent_of_record", label: "Agent-of-record" },
  { value: "suppressed_template_off", label: "Template off" },
  { value: "suppressed_per_contact_trigger_off", label: "Per-contact off" },
  { value: "suppressed_other", label: "Other" },
];

const RANGE_OPTIONS: { value: FiringRange; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All time" },
];

export default function SchedulerActivityClient() {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [outcome, setOutcome] = useState<FiringOutcomeFilter>("all");
  const [range, setRange] = useState<FiringRange>("30d");
  const [rows, setRows] = useState<DisplayRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(
    async (o: FiringOutcomeFilter, r: FiringRange) => {
      setLoading(true);
      setError(null);
      setRows([]);
      setNextCursor(null);
      setExpandedId(null);
      try {
        const url = `/api/dashboard/scheduler/firings?outcome=${o}&range=${r}&limit=50`;
        const res = await fetch(url);
        const data = (await res.json()) as {
          ok?: boolean;
          rows?: DisplayRow[];
          nextCursor?: string | null;
          error?: string;
        };
        if (!res.ok || !data.ok) throw new Error(data.error || "Load failed");
        setRows(data.rows ?? []);
        setNextCursor(data.nextCursor ?? null);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Load failed");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load(outcome, range);
  }, [outcome, range, load]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const url = `/api/dashboard/scheduler/firings?outcome=${outcome}&range=${range}&before=${encodeURIComponent(nextCursor)}&limit=50`;
      const res = await fetch(url);
      const data = (await res.json()) as {
        ok?: boolean;
        rows?: DisplayRow[];
        nextCursor?: string | null;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error || "Load failed");
      setRows((prev) => [...prev, ...(data.rows ?? [])]);
      setNextCursor(data.nextCursor ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t("pages.scheduler.colOutcome")}</span>
          <div className="flex flex-wrap gap-1">
            {OUTCOME_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setOutcome(o.value)}
                className={`rounded-full px-2.5 py-1 text-xs ${ outcome === o.value ? "bg-[#0072ce] text-white" : "border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:border-slate-300" }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t("pages.scheduler.range")}</span>
          <div className="flex flex-wrap gap-1">
            {RANGE_OPTIONS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRange(r.value)}
                className={`rounded-full px-2.5 py-1 text-xs ${ range === r.value ? "bg-[#0072ce] text-white" : "border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:border-slate-300" }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        {loading ? (
          <div className="p-8 text-sm text-slate-500"><LoadingText /></div>
        ) : rows.length === 0 ? (
          <EmptyState outcome={outcome} />
        ) : (
          <>
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/60">
                <tr>
                  <Th>{t("pages.scheduler.colWhen")}</Th>
                  <Th>{t("pages.scheduler.colContact")}</Th>
                  <Th>{t("pages.scheduler.colTemplate")}</Th>
                  <Th>{t("pages.scheduler.colPeriod")}</Th>
                  <Th>{t("pages.scheduler.colOutcome")}</Th>
                  <Th />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((r) => {
                  const expanded = expandedId === r.id;
                  return (
                    <>
                      <tr
                        key={r.id}
                        className="cursor-pointer hover:bg-slate-50/60 dark:hover:bg-slate-800"
                        onClick={() => setExpandedId(expanded ? null : r.id)}
                      >
                        <Td>
                          <div className="text-slate-700 dark:text-slate-300">{relativeTime(r.firedAt, t, locale)}</div>
                          <div className="text-[10px] text-slate-500">
                            {new Date(r.firedAt).toLocaleString(locale)}
                          </div>
                        </Td>
                        <Td>
                          <div className="flex items-center gap-2">
                            <span
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                              style={{ background: r.contactAvatarColor ?? "#6B5D4E" }}
                            >
                              {((r.contactFirstName[0] ?? "") + (r.contactLastName?.[0] ?? "")).toUpperCase()}
                            </span>
                            <Link
                              href={`/dashboard/sphere/${r.contactId}`}
                              onClick={(e) => e.stopPropagation()}
                              className="truncate font-medium text-slate-900 dark:text-slate-100 hover:underline"
                            >
                              {r.contactFullName}
                            </Link>
                          </div>
                        </Td>
                        <Td>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[10px] text-slate-500">{r.templateId}</span>
                            {r.templateChannel && (
                              <span
                                className={`rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                                  r.templateChannel === "sms"
                                    ? "bg-blue-50 text-blue-700"
                                    : "bg-violet-50 text-violet-700"
                                }`}
                              >
                                {r.templateChannel}
                              </span>
                            )}
                          </div>
                          {r.templateName && (
                            <div className="text-[10px] text-slate-500">{r.templateName}</div>
                          )}
                        </Td>
                        <Td className="font-mono text-[10px] text-slate-500">{r.periodKey}</Td>
                        <Td>
                          <OutcomeBadge
                            draftId={r.draftId}
                            draftStatus={r.draftStatus}
                            suppressedReason={r.suppressedReason}
                          />
                        </Td>
                        <Td>
                          <button
                            type="button"
                            className="text-[10px] text-slate-500 hover:text-slate-900"
                            aria-expanded={expanded}
                          >
                            {expanded ? "▾" : "▸"}
                          </button>
                        </Td>
                      </tr>
                      {expanded && (
                        <tr className="bg-slate-50/50 dark:bg-slate-900/60">
                          <td colSpan={6} className="px-3 py-3">
                            <div className="flex flex-wrap gap-6 text-[11px]">
                              {r.draftId && (
                                <Link
                                  href="/dashboard/drafts"
                                  className="text-brand-accent-text hover:underline"
                                >
                                  {t("pages.schedulerActivity.openDraft")}
                                </Link>
                              )}
                              <div>
                                <span className="text-slate-500">{t("pages.scheduler.firedAt")}</span>
                                {new Date(r.firedAt).toISOString()}
                              </div>
                            </div>
                            <pre className="mt-2 overflow-auto rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-[10px] leading-snug text-slate-700 dark:text-slate-300">
                              {JSON.stringify(r.triggerContext, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
            {nextCursor && (
              <div className="border-t border-slate-100 dark:border-slate-700 p-3 text-center">
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  {loadingMore ? <LoadingText /> : t("common:actions.load_more")}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState({ outcome }: { outcome: FiringOutcomeFilter }) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  if (outcome === "all") {
    return (
      <div className="p-8 text-center text-sm text-slate-500">
        <div className="font-medium text-slate-700 dark:text-slate-300">{t("pages.scheduler.noActivity")}</div>
        <p className="mt-1">
          Each time the scheduler runs, every (contact × template) evaluation lands here — created,
          suppressed, already fired, and errors. Run the scheduler from the{" "}
          <Link href="/dashboard/drafts" className="text-brand-accent-text hover:underline">{t("pages.scheduler.draftsPage")}</Link>{" "}{t("pages.dashFragments.toPopulateFeed")}</p>
      </div>
    );
  }
  return (
    <div className="p-8 text-center text-sm text-slate-500">{t("pages.scheduler.noMatches")}</div>
  );
}

function OutcomeBadge({
  draftId,
  draftStatus,
  suppressedReason,
}: {
  draftId: string | null;
  draftStatus: string | null;
  suppressedReason: string | null;
}) {
  // Its own hook: a sub-component inherits no translator from its parent.
  const { t } = useTranslation("dashboard");
  if (draftId) {
    const label =
      draftStatus === "sent"
        ? "Sent"
        : draftStatus === "approved"
          ? "Approved"
          : draftStatus === "rejected"
            ? "Rejected"
            : draftStatus === "failed"
              ? "Failed"
              : "Created";
    const cls =
      draftStatus === "sent"
        ? "bg-green-50 text-green-700"
        : draftStatus === "approved"
          ? "bg-blue-50 text-blue-700"
          : draftStatus === "rejected"
            ? "bg-slate-100 text-slate-500"
            : draftStatus === "failed"
              ? "bg-red-50 text-red-700"
              : "bg-amber-50 text-amber-700";
    return (
      <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>
        {label}
      </span>
    );
  }
  if (suppressedReason) {
    return (
      <span
        className="inline-flex rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
        title={suppressedReason}
      >
        {t("pages.schedulerActivity.suppressed", { reason: suppressedReason.replace(/_/g, " ") })}
      </span>
    );
  }
  return <span className="text-[10px] text-slate-500">—</span>;
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 align-top ${className ?? ""}`}>{children}</td>;
}

type Translate = (k: string, o?: Record<string, unknown>) => string;

function relativeTime(iso: string, t: Translate, locale: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("pages.scheduler.justNow");
  if (mins < 60) return t("pages.scheduler.minsAgo", { n: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t("pages.scheduler.hrsAgo", { n: hrs });
  const days = Math.floor(hrs / 24);
  if (days < 7) return t("pages.scheduler.daysAgo", { n: days });
  return new Date(iso).toLocaleDateString(locale);
}
