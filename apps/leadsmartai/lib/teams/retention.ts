import type { PerformanceMetrics, PerformanceRow } from "./performance";

/**
 * Retention signals — the pure half.
 *
 * A broker loses an agent months after the agent's activity fell, and learns
 * it from a resignation. This reads the 90-day performance window against
 * the 90 days before it and names, per agent, what changed enough to act on:
 *
 *   gone_quiet     had real activity last quarter, none this quarter
 *   slipping       activity at half or less of last quarter
 *   closings_down  closed deals last quarter, none this quarter
 *
 * and the other direction, which is worth a word too:
 *
 *   rising         activity up by half or more (or from nothing) to a real level
 *   new_closer     first closing after a quarter without one
 *
 * Activity is leads + messages + calls answered + appointments: the daily
 * work, not the money, because the money lags it by a quarter.
 */

export type RiskReason = "gone_quiet" | "slipping" | "closings_down";
export type RiseReason = "rising" | "new_closer";

/** Below this, a quarter's activity is noise and says nothing about the agent. */
export const ACTIVITY_FLOOR = 10;

export type RetentionRow = {
  agentId: string;
  name: string | null;
  email: string | null;
  activity: number;
  previousActivity: number;
  dealsClosed: number;
  previousDealsClosed: number;
  closedVolume: number;
  previousClosedVolume: number;
};

export type RetentionSignals = {
  days: number;
  atRisk: (RetentionRow & { reasons: RiskReason[] })[];
  rising: (RetentionRow & { reasons: RiseReason[] })[];
  /** Agents with a real quarter on either side, i.e. who the signals could see. */
  considered: number;
};

export function activityOf(m: PerformanceMetrics): number {
  return m.newLeads + m.conversations + m.callsAnswered + m.appointments;
}

export function riskReasons(cur: PerformanceMetrics, prev: PerformanceMetrics): RiskReason[] {
  const out: RiskReason[] = [];
  const a = activityOf(cur);
  const p = activityOf(prev);
  if (p >= ACTIVITY_FLOOR && a === 0) out.push("gone_quiet");
  else if (p >= ACTIVITY_FLOOR && a <= p / 2) out.push("slipping");
  if (prev.dealsClosed >= 2 && cur.dealsClosed === 0) out.push("closings_down");
  return out;
}

export function riseReasons(cur: PerformanceMetrics, prev: PerformanceMetrics): RiseReason[] {
  const out: RiseReason[] = [];
  const a = activityOf(cur);
  const p = activityOf(prev);
  if (a >= ACTIVITY_FLOOR && (p === 0 || a >= p * 1.5)) out.push("rising");
  if (prev.dealsClosed === 0 && cur.dealsClosed >= 1) out.push("new_closer");
  return out;
}

export function buildRetentionSignals(days: number, rows: readonly PerformanceRow[]): RetentionSignals {
  const atRisk: RetentionSignals["atRisk"] = [];
  const rising: RetentionSignals["rising"] = [];
  let considered = 0;
  for (const r of rows) {
    const base: RetentionRow = {
      agentId: r.agentId,
      name: r.name,
      email: r.email,
      activity: activityOf(r),
      previousActivity: activityOf(r.previous),
      dealsClosed: r.dealsClosed,
      previousDealsClosed: r.previous.dealsClosed,
      closedVolume: r.closedVolume,
      previousClosedVolume: r.previous.closedVolume,
    };
    if (base.activity >= ACTIVITY_FLOOR || base.previousActivity >= ACTIVITY_FLOOR || base.dealsClosed > 0 || base.previousDealsClosed > 0) considered += 1;
    const risk = riskReasons(r, r.previous);
    if (risk.length) atRisk.push({ ...base, reasons: risk });
    const rise = riseReasons(r, r.previous);
    // An agent cannot be both: a closer whose activity vanished is at risk, full stop.
    if (rise.length && risk.length === 0) rising.push({ ...base, reasons: rise });
  }
  // The biggest producer at risk first: that is the one whose leaving costs the most.
  atRisk.sort((a, b) => b.previousClosedVolume - a.previousClosedVolume || b.previousActivity - a.previousActivity);
  rising.sort((a, b) => b.closedVolume - a.closedVolume || b.activity - a.activity);
  return { days, atRisk, rising, considered };
}
