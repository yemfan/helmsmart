/**
 * What the Command Center can truthfully say about the AI workforce.
 *
 *   unconfigured → no employees yet; the workforce board below offers setup
 *   idle         → employees exist but recorded no work in the window — say
 *                  so, and point at the next step, instead of a zero-count
 *                  sentence
 *   active       → real work; the top metrics feed the grid's one node
 *
 * Only metrics with a positive total count: a zero is not a KPI worth a slot,
 * and a grid of dashes is a placeholder, not information.
 */

export type CommandCenterState =
  | { kind: "unconfigured" }
  | { kind: "idle"; receptionistLive: boolean }
  | {
      kind: "active";
      totalActions: number;
      employeeCount: number;
      /** Up to three `[metricKey, total]` pairs, largest first. */
      topMetrics: [string, number][];
    };

export function commandCenterState(
  summary: { totals: Record<string, number>; employees: readonly unknown[] },
  receptionistLive: boolean,
): CommandCenterState {
  const employeeCount = summary.employees.length;
  if (employeeCount === 0) return { kind: "unconfigured" };

  const worked = Object.entries(summary.totals)
    .filter(([, v]) => Number.isFinite(v) && v > 0)
    .sort((a, b) => b[1] - a[1]);
  const totalActions = worked.reduce((sum, [, v]) => sum + v, 0);
  if (totalActions === 0) return { kind: "idle", receptionistLive };

  return { kind: "active", totalActions, employeeCount, topMetrics: worked.slice(0, 3) };
}
