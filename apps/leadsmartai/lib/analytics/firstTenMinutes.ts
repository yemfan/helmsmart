/**
 * The first ten minutes — pure arithmetic over `agent_first_moments()` rows.
 *
 * Two numbers the audit asked onboarding to be measured by: how long a new
 * agent waits before Max shows them a proposal, and before they approve one.
 * Medians, not means — one agent who came back after a month would swamp a
 * mean. `within10m` is the share of agents who reached each moment inside
 * ten minutes of signing up, the bar the audit set.
 */
export type FirstMomentRow = {
  agent_id: number | string;
  signed_up_at: string | null;
  first_proposal_at: string | null;
  first_approval_at: string | null;
};

export type FirstTenMinutes = {
  agents: number;
  proposal: MomentStats;
  approval: MomentStats;
};

export type MomentStats = {
  /** Agents who reached this moment at all. */
  reached: number;
  /** Median minutes from signup, among those who reached it. Null when nobody has. */
  medianMinutes: number | null;
  /** Share of ALL agents who reached it within ten minutes of signup. */
  within10m: number | null;
};

const TEN_MINUTES = 10;

export function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function minutesBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return (b - a) / 60000;
}

function stats(rows: readonly FirstMomentRow[], pick: (r: FirstMomentRow) => string | null): MomentStats {
  const minutes = rows
    .map((r) => minutesBetween(r.signed_up_at, pick(r)))
    .filter((m): m is number => m !== null);
  const reached = minutes.length;
  const quick = minutes.filter((m) => m <= TEN_MINUTES).length;
  return {
    reached,
    medianMinutes: medianOf(minutes) === null ? null : Math.round(medianOf(minutes) as number),
    within10m: rows.length > 0 ? quick / rows.length : null,
  };
}

export function firstTenMinutes(rows: readonly FirstMomentRow[]): FirstTenMinutes {
  return {
    agents: rows.length,
    proposal: stats(rows, (r) => r.first_proposal_at),
    approval: stats(rows, (r) => r.first_approval_at),
  };
}

/** "3 min", "1.5 h", "2 d" — a median a founder can read at a glance. */
export function formatMinutes(m: number | null): string {
  if (m === null) return "—";
  if (m < 60) return `${Math.round(m)} min`;
  if (m < 60 * 24) return `${(m / 60).toFixed(1).replace(/\.0$/, "")} h`;
  return `${(m / (60 * 24)).toFixed(1).replace(/\.0$/, "")} d`;
}
