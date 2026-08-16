"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";

import {
  buildZipCoverageMap,
  type RosterItem,
  type RosterSource,
} from "@/lib/leadAssignment/adminRoster";

const SOURCE_LABEL: Record<RosterSource, { label: string; tone: string }> = {
  db: { label: "DB", tone: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  env: { label: "ENV", tone: "bg-amber-50 text-amber-700 ring-amber-200" },
  both: { label: "DB + ENV", tone: "bg-slate-100 text-slate-700 ring-slate-200" },
};

function formatDate(iso: string | null, locale: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(locale, {
      month: "short",
      day: "numeric",
      year: "2-digit",
    });
  } catch {
    return iso;
  }
}

type Translate = (k: string, o?: Record<string, unknown>) => string;

function relativeAgo(iso: string | null, t: Translate, locale: string): string {
  if (!iso) return t("pages.leadRouting.never");
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days <= 0) return t("pages.leadRouting.today");
  if (days === 1) return t("pages.leadRouting.oneDayAgo");
  if (days < 30) return t("pages.leadRouting.daysAgo", { count: days });
  return formatDate(iso, locale);
}

export default function LeadRoutingAdminClient() {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [roster, setRoster] = useState<RosterItem[]>([]);
  const [hasDbRules, setHasDbRules] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/dashboard/admin/lead-routing", {
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          roster?: RosterItem[];
          hasDbRules?: boolean;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || data.ok === false) {
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        setRoster(data.roster ?? []);
        setHasDbRules(Boolean(data.hasDbRules));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const enrolledCount = useMemo(
    () => roster.filter((r) => r.inRoundRobin).length,
    [roster],
  );

  const totalAssignmentsLast30 = useMemo(
    () => roster.reduce((sum, r) => sum + r.assignmentCountLast30Days, 0),
    [roster],
  );

  const zipMap = useMemo(() => buildZipCoverageMap(roster), [roster]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
        <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Couldn&apos;t load routing roster: {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <KpiStrip
        enrolledCount={enrolledCount}
        rosterSize={roster.length}
        totalAssignmentsLast30={totalAssignmentsLast30}
      />

      {!hasDbRules && roster.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          No DB rules yet — pool is currently driven by the{" "}
          <code className="rounded bg-white/50 px-1 py-0.5 text-[12px]">
            IDX_ROUND_ROBIN_AGENT_IDS
          </code>{" "}
          env allowlist. Each agent can take over their slot by enrolling from
          their settings page.
        </div>
      ) : null}

      {roster.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-600">{t("pages.leadRouting.noAgents")}</div>
      ) : (
        <RosterTable roster={roster} />
      )}

      {zipMap.size > 0 ? <ZipCoverageGrid zipMap={zipMap} roster={roster} /> : null}
    </div>
  );
}

function KpiStrip({
  enrolledCount,
  rosterSize,
  totalAssignmentsLast30,
}: {
  enrolledCount: number;
  rosterSize: number;
  totalAssignmentsLast30: number;
}) {
  const cells = [
    { label: "Enrolled in pool", value: String(enrolledCount), tone: "text-slate-900" },
    { label: "Total roster", value: String(rosterSize), tone: "text-slate-900" },
    {
      label: "Leads routed (30d)",
      value: String(totalAssignmentsLast30),
      tone: totalAssignmentsLast30 > 0 ? "text-emerald-700" : "text-slate-900",
    },
  ];
  return (
    <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200">
      {cells.map((c) => (
        <div key={c.label} className="bg-white px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {c.label}
          </p>
          <p className={`mt-1 text-xl font-bold tabular-nums ${c.tone}`}>{c.value}</p>
        </div>
      ))}
    </div>
  );
}

function RosterTable({ roster }: { roster: RosterItem[] }) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-900">{t("pages.leadRouting.roster")}</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Sorted by recent activity. Disabled rows are agents whose DB rule has{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px]">
            in_round_robin = false
          </code>
          .
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left font-semibold">{t("pages.leadRouting.colAgent")}</th>
              <th className="px-4 py-2 text-center font-semibold">{t("pages.leadRouting.colSource")}</th>
              <th className="px-4 py-2 text-center font-semibold">{t("pages.leadRouting.colEnrolled")}</th>
              <th className="px-4 py-2 text-right font-semibold">{t("pages.leadRouting.colZip")}</th>
              <th className="px-4 py-2 text-right font-semibold">{t("pages.leadRouting.colPriority")}</th>
              <th className="px-4 py-2 text-right font-semibold">{t("pages.leadRouting.colLastAssigned")}</th>
              <th className="px-4 py-2 text-right font-semibold">30d</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((r) => (
              <tr
                key={r.agentId}
                className={`border-t border-slate-100 ${r.inRoundRobin ? "" : "opacity-60"}`}
              >
                <td className="px-4 py-2 text-slate-900">
                  <p className="font-semibold">{r.displayName ?? "—"}</p>
                  <p className="font-mono text-[10px] text-slate-400">{r.agentId}</p>
                </td>
                <td className="px-4 py-2 text-center">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${SOURCE_LABEL[r.source].tone}`}
                  >
                    {SOURCE_LABEL[r.source].label}
                  </span>
                </td>
                <td className="px-4 py-2 text-center text-xs">
                  {r.inRoundRobin ? (
                    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">{t("pages.leadRouting.active")}</span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200">{t("pages.leadRouting.off")}</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right text-xs text-slate-700">
                  {r.zipCoverage.length === 0
                    ? <span className="text-slate-400">{t("pages.leadRouting.anyZip")}</span>
                    : r.zipCoverage.length <= 4
                      ? r.zipCoverage.join(", ")
                      : `${r.zipCoverage.slice(0, 3).join(", ")} +${r.zipCoverage.length - 3}`}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-700">
                  {r.priority}
                </td>
                <td className="px-4 py-2 text-right text-xs text-slate-700">
                  {relativeAgo(r.lastAssignmentAt, t, locale)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-700">
                  {r.assignmentCountLast30Days}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ZipCoverageGrid({
  zipMap,
  roster,
}: {
  zipMap: Map<string, string[]>;
  roster: RosterItem[];
}) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const nameById = new Map<string, string>();
  for (const r of roster) {
    nameById.set(r.agentId, r.displayName ?? r.agentId);
  }
  const entries = Array.from(zipMap.entries()).sort(([a], [b]) => (a < b ? -1 : 1));

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-900">{t("pages.leadRouting.colZip")}</h2>
        <p className="mt-0.5 text-xs text-slate-500">{t("pages.leadRouting.coverageNote")}</p>
      </header>
      <ul className="divide-y divide-slate-100">
        {entries.map(([zip, agentIds]) => (
          <li
            key={zip}
            className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm"
          >
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-slate-700">
              {zip}
            </span>
            <span className="flex-1 text-slate-700">
              {agentIds.map((id, i) => (
                <span key={id}>
                  {nameById.get(id) ?? id}
                  {i < agentIds.length - 1 ? ", " : ""}
                </span>
              ))}
            </span>
            <span className="text-[11px] text-slate-400">
              {agentIds.length} agent{agentIds.length === 1 ? "" : "s"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
