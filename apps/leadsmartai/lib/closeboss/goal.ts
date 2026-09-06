/**
 * The realtor's "one win this month" from Max's welcome interview, as a key
 * the app can act on.
 *
 * The interview stores the choice label as typed ("🎯 More leads"); nothing
 * downstream should match on emoji or exact wording, so this reduces it to
 * one of five goals — and says what each goal changes: which quick commands
 * Ask Max offers first, and which of today's priorities float to the top.
 *
 * Client-safe: pure.
 */
export type GoalKey = "leads" | "followup" | "admin" | "listings" | "marketing";

export const GOAL_KEYS: readonly GoalKey[] = ["leads", "followup", "admin", "listings", "marketing"];

const PATTERNS: Array<[GoalKey, RegExp]> = [
  ["followup", /follow[\s-]?up|faster|respond|response/i],
  ["listings", /listing|seller|sell/i],
  ["marketing", /marketing|brand|social|content/i],
  ["admin", /admin|paperwork|less\s+work|organi[sz]/i],
  ["leads", /lead|buyer|client|pipeline|business/i],
];

/** "🎯 More leads" → "leads"; unknown or empty → null. */
export function goalKey(raw: unknown): GoalKey | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  if ((GOAL_KEYS as readonly string[]).includes(s)) return s as GoalKey;
  for (const [key, re] of PATTERNS) if (re.test(s)) return key;
  return null;
}

/** Quick-command chips under the Ask Max composer, goal first. Keys under `boss.suggestions`. */
export const GOAL_SUGGESTIONS: Record<GoalKey, readonly string[]> = {
  leads: ["findLeads", "sphereReach"],
  followup: ["checkIn", "coldLeads"],
  admin: ["planDay", "clearTasks"],
  listings: ["likelySellers", "sphereReach"],
  marketing: ["justListed", "weekPosts"],
};

export const DEFAULT_SUGGESTIONS: readonly string[] = ["checkIn", "justListed", "planDay"];

/** Goal-first chips, then the defaults, no repeats, at most four. */
export function suggestionKeys(goal: GoalKey | null): string[] {
  const out: string[] = [];
  for (const k of [...(goal ? GOAL_SUGGESTIONS[goal] : []), ...DEFAULT_SUGGESTIONS]) {
    if (!out.includes(k)) out.push(k);
    if (out.length === 4) break;
  }
  return out;
}

/** Recommendation types that serve each goal — they sort ahead of the rest. */
export const GOAL_PRIORITY_TYPES: Record<GoalKey, readonly string[]> = {
  leads: ["hot_lead", "missed_calls"],
  followup: ["hot_lead", "missed_calls", "overdue_tasks"],
  admin: ["overdue_tasks", "transaction_deadline", "commission_missing", "invoice_overdue"],
  listings: ["hot_lead"],
  marketing: [],
};

/**
 * Stable re-order: items whose type serves the goal come first, each group
 * keeping its own priority order. Overdue deadlines still lead for someone
 * chasing admin; a hot lead still leads for someone chasing leads.
 */
export function orderForGoal<T extends { recommendation_type: string }>(items: readonly T[], goal: GoalKey | null): T[] {
  if (!goal) return [...items];
  const boosted = new Set(GOAL_PRIORITY_TYPES[goal]);
  return [...items.filter((i) => boosted.has(i.recommendation_type)), ...items.filter((i) => !boosted.has(i.recommendation_type))];
}
