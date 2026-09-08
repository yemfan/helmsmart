import type { TeamRole } from "./types";

/**
 * Team performance over a window — the pure half.
 *
 * The member breakdown answers "who has what" (contacts, open tasks, deals
 * in flight). This answers "who did what, lately": new leads, conversations,
 * calls, appointments, deals opened and closed, closed volume and commission,
 * hub traffic, posts — for the last N days, next to the N days before, so a
 * broker sees direction as well as size. Rows in, a ranked table out; the
 * reading lives in performance.server.ts.
 */

export type PerformanceMetrics = {
  newLeads: number;
  /** SMS messages in both directions plus emails, the agent's or the AI's. */
  conversations: number;
  callsAnswered: number;
  callsMissed: number;
  appointments: number;
  dealsOpened: number;
  dealsClosed: number;
  /** Sum of purchase_price on deals closed in the window. */
  closedVolume: number;
  /** Sum of gross_commission on deals closed in the window. */
  commission: number;
  hubViews: number;
  hubLeads: number;
  postsPublished: number;
};

export type PerformanceRow = PerformanceMetrics & {
  agentId: string;
  role: TeamRole;
  name: string | null;
  email: string | null;
  /** The same metrics for the window before this one. */
  previous: PerformanceMetrics;
  /** 1 = best closed volume in the team; ties share a rank. 0 when the window had no closings. */
  rank: number;
};

export type TeamPerformance = {
  days: number;
  rows: PerformanceRow[];
  totals: PerformanceMetrics;
  previousTotals: PerformanceMetrics;
};

export const METRIC_KEYS: (keyof PerformanceMetrics)[] = [
  "newLeads",
  "conversations",
  "callsAnswered",
  "callsMissed",
  "appointments",
  "dealsOpened",
  "dealsClosed",
  "closedVolume",
  "commission",
  "hubViews",
  "hubLeads",
  "postsPublished",
];

export function emptyMetrics(): PerformanceMetrics {
  return { newLeads: 0, conversations: 0, callsAnswered: 0, callsMissed: 0, appointments: 0, dealsOpened: 0, dealsClosed: 0, closedVolume: 0, commission: 0, hubViews: 0, hubLeads: 0, postsPublished: 0 };
}

export function sumMetrics(list: readonly PerformanceMetrics[]): PerformanceMetrics {
  const out = emptyMetrics();
  for (const m of list) for (const k of METRIC_KEYS) out[k] += m[k];
  return out;
}

/**
 * Change from the previous window as a fraction, or null when the previous
 * window had nothing (a rise from zero is "new", not "+∞%").
 */
export function delta(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return (current - previous) / previous;
}

export type PerformanceInput = {
  agentId: string;
  role: TeamRole;
  name: string | null;
  email: string | null;
  current: PerformanceMetrics;
  previous: PerformanceMetrics;
};

/**
 * Rank and order the table. Closed volume decides, then commission, then new
 * leads (the pipeline that becomes next quarter's closings), then name, so
 * the order is stable and the top of the table is the money.
 */
export function buildTeamPerformance(days: number, input: readonly PerformanceInput[]): TeamPerformance {
  const sorted = [...input].sort((a, b) => {
    if (a.current.closedVolume !== b.current.closedVolume) return b.current.closedVolume - a.current.closedVolume;
    if (a.current.commission !== b.current.commission) return b.current.commission - a.current.commission;
    if (a.current.newLeads !== b.current.newLeads) return b.current.newLeads - a.current.newLeads;
    return (a.name ?? a.email ?? a.agentId).localeCompare(b.name ?? b.email ?? b.agentId);
  });
  let rank = 0;
  let lastVolume = -1;
  const rows: PerformanceRow[] = sorted.map((r, i) => {
    if (r.current.closedVolume > 0) {
      if (r.current.closedVolume !== lastVolume) {
        rank = i + 1;
        lastVolume = r.current.closedVolume;
      }
    }
    return { agentId: r.agentId, role: r.role, name: r.name, email: r.email, ...r.current, previous: r.previous, rank: r.current.closedVolume > 0 ? rank : 0 };
  });
  return {
    days,
    rows,
    totals: sumMetrics(input.map((r) => r.current)),
    previousTotals: sumMetrics(input.map((r) => r.previous)),
  };
}

/** Which window a timestamp falls in: current, previous, or neither. */
export function windowOf(iso: string | null | undefined, now: number, days: number): "current" | "previous" | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const since = now - days * 86_400_000;
  if (t >= since && t <= now) return "current";
  if (t >= since - days * 86_400_000 && t < since) return "previous";
  return null;
}
