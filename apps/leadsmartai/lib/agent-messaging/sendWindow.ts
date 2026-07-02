/**
 * Shared "is it OK to send right now?" time-window guard.
 *
 * Pure function of the clock + the agent's messaging settings — no I/O — so it's
 * the single source of truth for the quiet-hours / Sunday-morning / Chinese-New-
 * Year pauses across every autosend path:
 *   - the sphere/lead-response draft dispatcher (lib/drafts/sender.ts), and
 *   - the Boss Assistant per-channel autopilot (lib/realtyboss/sendTaskDraft.ts).
 *
 * Per-contact daily caps live in their own pipeline (they count a specific
 * table) and are intentionally NOT here.
 */

export type SendBlockReason = "quiet_hours" | "sunday_morning" | "chinese_new_year";

/** Minimal settings shape this guard needs — satisfied by both the stored and
 *  effective AgentMessageSettings types. */
export type SendWindowSettings = {
  noSundayMorning: boolean;
  pauseChineseNewYear: boolean;
  quietHoursStart: string; // "HH:MM", agent-local
  quietHoursEnd: string; // "HH:MM", agent-local
};

/**
 * Why a message should NOT be auto-sent at `now`, or null if the window is open.
 * Agent-local clock (we don't yet carry per-contact timezones).
 */
export function quietHoursBlockReason(
  now: Date,
  s: SendWindowSettings,
): SendBlockReason | null {
  // Sunday morning: no messages Sunday before noon in agent local.
  if (s.noSundayMorning && now.getDay() === 0 && now.getHours() < 12) {
    return "sunday_morning";
  }
  if (s.pauseChineseNewYear && inChineseNewYearWindow(now)) {
    return "chinese_new_year";
  }
  const [h1, m1] = s.quietHoursStart.split(":").map(Number);
  const [h2, m2] = s.quietHoursEnd.split(":").map(Number);
  const mins = now.getHours() * 60 + now.getMinutes();
  const startMins = h1 * 60 + m1;
  const endMins = h2 * 60 + m2;
  const inWindow =
    startMins < endMins
      ? mins >= startMins && mins < endMins
      : mins >= startMins || mins < endMins; // crosses midnight
  return inWindow ? "quiet_hours" : null;
}

/**
 * The next time it's OK to send, given why `now` is blocked. Used to schedule a
 * deferred autopilot message instead of dropping it. Mirrors the sphere
 * dispatcher's deferral: Sunday → noon today; CNY → tomorrow (cheaper than
 * computing the lunar end); quiet hours → the next occurrence of quietHoursEnd.
 */
export function nextSendOpenAfter(
  now: Date,
  reason: SendBlockReason,
  s: SendWindowSettings,
): Date {
  if (reason === "sunday_morning") {
    const t = new Date(now);
    t.setHours(12, 0, 0, 0);
    return t;
  }
  if (reason === "chinese_new_year") {
    const t = new Date(now);
    t.setDate(t.getDate() + 1);
    return t;
  }
  const [h, m] = s.quietHoursEnd.split(":").map(Number);
  const t = new Date(now);
  t.setHours(h, m, 0, 0);
  if (t.getTime() <= now.getTime()) t.setDate(t.getDate() + 1);
  return t;
}

/** Approximate CNY detection — actual lunar date varies. Hardcoded table for
 *  2026-2030; expand as needed. */
export function inChineseNewYearWindow(now: Date): boolean {
  const cnyByYear: Record<number, [string, string]> = {
    2026: ["2026-02-17", "2026-02-21"],
    2027: ["2027-02-06", "2027-02-10"],
    2028: ["2028-01-26", "2028-01-30"],
    2029: ["2029-02-13", "2029-02-17"],
    2030: ["2030-02-03", "2030-02-07"],
  };
  const year = now.getFullYear();
  const range = cnyByYear[year];
  if (!range) return false;
  const iso = now.toISOString().slice(0, 10);
  return iso >= range[0] && iso <= range[1];
}
