"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";

export type NudgeLogRow = {
  id: string;
  agentId: string;
  agentEmail: string | null;
  agentFirstName: string | null;
  digestDate: string;
  taskCount: number;
  overdueCount: number;
  upcomingCount: number;
  emailSent: boolean;
  error: string | null;
  createdAt: string;
};

type FilterMode = "all" | "sent" | "skipped" | "errored";

export function NudgeLogClient({
  rows,
  error,
  cutoffIso,
}: {
  rows: NudgeLogRow[];
  error: string | null;
  cutoffIso: string;
}) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "sent" && !r.emailSent) return false;
      if (filter === "skipped" && (r.emailSent || r.error)) return false;
      if (filter === "errored" && !r.error) return false;
      if (!needle) return true;
      return (
        r.agentEmail?.toLowerCase().includes(needle) ||
        r.agentId.toLowerCase().includes(needle) ||
        r.agentFirstName?.toLowerCase().includes(needle)
      );
    });
  }, [rows, filter, q]);

  const summary = useMemo(() => {
    let sent = 0;
    let skipped = 0;
    let errored = 0;
    for (const r of rows) {
      if (r.error) errored += 1;
      else if (r.emailSent) sent += 1;
      else skipped += 1;
    }
    return { sent, skipped, errored, total: rows.length };
  }, [rows]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{t("pages.adminPages.nudgeLog")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("pages.dashFragments.nudgeHistory")}{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px]">{cutoffIso}</code>{" "}
          (last 14 days). Support tool — not linked in the sidebar.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{t("pages.dashFragments.errorLoadingRows")} {error}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t("pages.adminCommon.total")} value={summary.total} />
        <Stat label={t("pages.adminCommon.sent")} value={summary.sent} tone="green" />
        <Stat label={t("pages.adminPages.skippedNoTasks")} value={summary.skipped} />
        <Stat label={t("pages.adminCommon.errored")} value={summary.errored} tone={summary.errored > 0 ? "red" : "neutral"} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("pages.adminCommon.searchAgentEmailIdName")}
          className="min-w-[240px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as FilterMode)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <option value="all">{t("pages.adminCommon.allRows")}</option>
          <option value="sent">{t("pages.adminCommon.sentOnly")}</option>
          <option value="skipped">{t("pages.adminPages.skippedNoTasks")}</option>
          <option value="errored">{t("pages.adminCommon.erroredOnly")}</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{t("pages.adminCommon.digestDate")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("pages.adminCommon.agent")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("pages.adminPages.tasks")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("pages.adminPages.overdue")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("pages.adminPages.upcoming")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("pages.adminCommon.status")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("pages.adminCommon.recordedAt")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[12px] text-slate-900">
                    {r.digestDate}
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-slate-900">{r.agentEmail ?? <span className="text-slate-400">—</span>}</div>
                    <div className="font-mono text-[10px] text-slate-400">{r.agentId}</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.taskCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.overdueCount > 0 ? (
                      <span className="font-medium text-red-600">{r.overdueCount}</span>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                    {r.upcomingCount}
                  </td>
                  <td className="px-3 py-2">
                    {r.error ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">{t("pages.adminCommon.errored")}</span>
                        <span className="max-w-xs truncate text-[11px] text-red-600" title={r.error}>
                          {r.error}
                        </span>
                      </span>
                    ) : r.emailSent ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">{t("pages.adminCommon.sent")}</span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">{t("pages.adminCommon.skipped")}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-[11px] text-slate-500">
                    {new Date(r.createdAt).toLocaleString(locale)}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-400">{t("pages.adminCommon.noMatchingRows")}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "red" | "green" | "neutral" }) {
  const textColor =
    tone === "red" ? "text-red-600" : tone === "green" ? "text-green-600" : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className={`text-xl font-semibold ${textColor}`}>{value}</div>
    </div>
  );
}
