"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  MemberBreakdownRow,
  MemberMetrics,
  TeamBreakdown,
} from "@/lib/teams/breakdown";

/**
 * Per-member breakdown table on /dashboard/team.
 *
 * Renders a compact "leaderboard" table — one row per agent in the
 * roster + a totals row — so the owner can see which member is
 * driving what. Sort order, sourced from the pure builder, is:
 *   1. Owner (always first)
 *   2. Closed YTD desc
 *   3. Contacts desc
 *   4. Agent id asc
 */
export function TeamBreakdownPanel({ teamId }: { teamId: string }) {
  const { t } = useTranslation("dashboard");
  const [breakdown, setBreakdown] = useState<TeamBreakdown | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/team/${teamId}/breakdown`)
      .then((r) => r.json())
      .then((j: { ok: boolean; breakdown: TeamBreakdown }) => {
        if (cancelled) return;
        if (j.ok) setBreakdown(j.breakdown);
      })
      .catch(() => {
        if (!cancelled) setBreakdown(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 ring-1 ring-slate-900/[0.04] shadow-sm">
      <header>
        <h2 className="text-base font-semibold text-slate-900">{t("pages.teamBreakdown.title")}</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          {t("pages.teamBreakdown.subtitle")}
        </p>
      </header>

      <div className="mt-4 -mx-6 overflow-x-auto px-6">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              <Th>{t("pages.teamBreakdown.agent")}</Th>
              <Th align="right">{t("pages.teamBreakdown.contacts")}</Th>
              <Th align="right">{t("pages.teamBreakdown.hotLeads")}</Th>
              <Th align="right" className="hidden md:table-cell">{t("pages.teamBreakdown.tasks30d")}</Th>
              <Th align="right" className="hidden md:table-cell">{t("pages.teamBreakdown.openTasks")}</Th>
              <Th align="right">{t("pages.teamBreakdown.activeDeals")}</Th>
              <Th align="right">{t("pages.teamBreakdown.closedYtd")}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <SkeletonRows />
            ) : !breakdown || breakdown.rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-xs text-slate-500">{t("pages.teamBreakdown.empty")}</td>
              </tr>
            ) : (
              <>
                {breakdown.rows.map((r) => (
                  <Row key={r.agentId} row={r} />
                ))}
                <TotalsRow totals={breakdown.totals} />
              </>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Row({ row }: { row: MemberBreakdownRow }) {
  const { t } = useTranslation("dashboard");
  return (
    <tr className="text-slate-800">
      <td className="py-2.5 pr-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{t("pages.dashFragments.agentLabel")} {shortenId(row.agentId)}
          </span>
          {row.role === "owner" ? (
            <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-blue-700 ring-1 ring-blue-200">{t("pages.teamBreakdown.owner")}</span>
          ) : null}
        </div>
      </td>
      <Td align="right">{row.contactsTotal}</Td>
      <Td align="right">{row.leadsHot}</Td>
      <Td align="right" className="hidden md:table-cell">
        {row.tasksCompletedLast30d}
      </Td>
      <Td align="right" className="hidden md:table-cell">
        {row.tasksOpen}
      </Td>
      <Td align="right">{row.transactionsActive}</Td>
      <Td align="right" tone="primary">
        {row.transactionsClosedYtd}
      </Td>
    </tr>
  );
}

function TotalsRow({ totals }: { totals: MemberMetrics }) {
  const { t } = useTranslation("dashboard");
  return (
    <tr className="bg-slate-50/60 text-slate-900 font-semibold">
      <td className="py-2.5 pr-3 text-xs uppercase tracking-wider text-slate-500">{t("pages.teamBreakdown.teamTotal")}</td>
      <Td align="right">{totals.contactsTotal}</Td>
      <Td align="right">{totals.leadsHot}</Td>
      <Td align="right" className="hidden md:table-cell">
        {totals.tasksCompletedLast30d}
      </Td>
      <Td align="right" className="hidden md:table-cell">
        {totals.tasksOpen}
      </Td>
      <Td align="right">{totals.transactionsActive}</Td>
      <Td align="right" tone="primary">
        {totals.transactionsClosedYtd}
      </Td>
    </tr>
  );
}

function Th({
  children,
  align,
  className = "",
}: {
  children: React.ReactNode;
  align?: "right";
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`px-3 py-2 ${align === "right" ? "text-right" : "text-left"} ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  tone,
  className = "",
}: {
  children: React.ReactNode;
  align?: "right";
  tone?: "primary";
  className?: string;
}) {
  const color = tone === "primary" ? "text-blue-700" : "text-slate-800";
  return (
    <td
      className={`px-3 py-2 tabular-nums ${align === "right" ? "text-right" : "text-left"} ${color} ${className}`}
    >
      {children}
    </td>
  );
}

function SkeletonRows() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <tr key={i}>
          {[0, 1, 2, 3, 4, 5, 6].map((j) => (
            <td key={j} className="px-3 py-3">
              <div className="h-3 animate-pulse rounded bg-slate-100" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function shortenId(id: string): string {
  if (id.length <= 8) return id;
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}
