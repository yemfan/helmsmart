/**
 * The autonomy dial — how much rope the owner gives each AI teammate.
 *
 * Three levels, in the owner's words rather than ours:
 *
 *   suggest            "Suggest only — tell me what you'd do"
 *   act_with_approval  "Ask me first — do it once I approve"
 *   autonomous         "Go ahead — and show me what you did"
 *
 * WHERE IT LIVES. On the employee's own row, in `ai_employees.permissions`
 * (jsonb) — the same field `enforceAutonomy` has always read. The roster
 * blueprint (`packages/ai-workforce/src/roster.ts`) is the DEFAULT the row is
 * seeded with and the fallback when the row says nothing; it is never the
 * authority once a business has one. No new column, no migration.
 *
 * WHO READS IT. Both paths that can act for a teammate:
 *   • `lib/workforce-gating.ts` — unattended work (Emma's inbound texts);
 *   • `lib/ai-team/run-action.ts` — Mark's tool loop, which until now parked
 *     EVERY outbound action for approval whatever the dial said, so "go ahead"
 *     and "suggest only" both behaved as "ask me first".
 *
 * WHICH LEVELS ARE REAL. Not all three make sense for everyone, and a dial
 * offering a level that changes nothing is worse than no dial (`CLAUDE.md`):
 *
 *   • a teammate who owns no action that WRITES anything has no dial at all —
 *     there is nothing for the owner to hold back or let go;
 *   • Emma is never "suggest only". She is on a live call or answering a text
 *     the moment it arrives; she cannot put a caller on hold to tell the owner
 *     what she would have said, and a customer left unanswered while nobody is
 *     told is the worst of the three outcomes.
 *
 * The set is derived from the action registry rather than written out by hand,
 * so a teammate who gains their first action gains their dial with it.
 */
import { getBlueprint, getEmployee } from "@helm/ai-workforce";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnyAction } from "./types";

export const AUTONOMY_LEVELS = ["suggest", "act_with_approval", "autonomous"] as const;
export type AutonomyLevel = (typeof AUTONOMY_LEVELS)[number];

/** The level a teammate falls back to when neither the row nor the roster says. */
const LAST_RESORT: AutonomyLevel = "act_with_approval";

/** Emma answers in real time; "tell me what you'd say" is not a thing she can do. */
const NEVER_SUGGESTS = new Set(["emma"]);

export function isAutonomyLevel(v: unknown): v is AutonomyLevel {
  return typeof v === "string" && (AUTONOMY_LEVELS as readonly string[]).includes(v);
}

/**
 * Who owns what, as far as the dial cares: work that writes inside the
 * business (`internal`) and work that reaches a customer (`outbound`). A
 * teammate who only ever reads is gated by nothing — reading is not an act.
 */
export type DialOwners = { internal: Set<string>; outbound: Set<string> };

export function dialOwners(actions: readonly AnyAction[]): DialOwners {
  const internal = new Set<string>();
  const outbound = new Set<string>();
  for (const a of actions) {
    if (a.riskClass === "internal") internal.add(a.employee);
    else if (a.riskClass === "outbound") outbound.add(a.employee);
  }
  return { internal, outbound };
}

/**
 * The levels worth offering one teammate — empty when they have no dial.
 *
 *   nothing they own writes        no dial at all
 *   internal work only             "suggest" or "go ahead". "Ask me first" is
 *                                  a level with nothing to approve: adding a
 *                                  task to your own list is not a decision
 *                                  worth a queue
 *   anything reaches a customer    all three, minus "suggest" for anyone who
 *                                  answers in real time
 */
export function levelsFor(slug: string, owners: DialOwners): AutonomyLevel[] {
  const reachesCustomers = owners.outbound.has(slug);
  if (!reachesCustomers && !owners.internal.has(slug)) return [];
  return AUTONOMY_LEVELS.filter(
    (l) =>
      !(l === "suggest" && NEVER_SUGGESTS.has(slug)) &&
      !(l === "act_with_approval" && !reachesCustomers),
  );
}

/** The roster's default for a slug — what a business starts on. */
export function defaultAutonomy(slug: string): AutonomyLevel {
  const fromRoster = getBlueprint(slug)?.permissions.autonomy;
  return isAutonomyLevel(fromRoster) ? fromRoster : LAST_RESORT;
}

/**
 * The level in force for an employee: what the row holds, else the roster's
 * default. Deliberately NOT "autonomous" when the row says nothing — an empty
 * `permissions` blob used to mean free rein, which is the wrong way round for
 * a value nobody has set.
 */
export function autonomyOf(
  employee: { permissions?: { autonomy?: string | null } | null } | null | undefined,
  slug: string,
): AutonomyLevel {
  const stored = employee?.permissions?.autonomy;
  return isAutonomyLevel(stored) ? stored : defaultAutonomy(slug);
}

/**
 * The level in force, read from the database. A failed read is the roster's
 * default rather than an exception: a teammate whose row cannot be read should
 * behave as they were shipped, not act freely and not go silent.
 */
export async function storedAutonomy(
  db: SupabaseClient,
  orgId: string,
  slug: string,
): Promise<AutonomyLevel> {
  try {
    return autonomyOf(await getEmployee(db, orgId, slug), slug);
  } catch (e) {
    console.error(`[ai-team] could not read ${slug}'s autonomy:`, e);
    return defaultAutonomy(slug);
  }
}

export type SetAutonomyResult =
  | { ok: true; level: AutonomyLevel; activated: boolean }
  | { ok: false; reason: "not_found" | "refused" | "failed" };

/**
 * Persist the dial, and prove a row moved.
 *
 * Through the RLS client an update a policy forbids matches zero rows and
 * comes back clean, so the rows are asked for back (`CLAUDE.md`) — "saved
 * nothing" must not read as "saved".
 *
 * A teammate the seeder left in `draft` is switched ON by the same write.
 * Draft means "nobody has said how this one works yet"; saying it is exactly
 * what the owner just did, and a dial set to "go ahead" over a row the gate
 * skips entirely would be a control showing a state the database does not hold.
 */
export async function setStoredAutonomy(
  db: SupabaseClient,
  orgId: string,
  slug: string,
  level: AutonomyLevel,
): Promise<SetAutonomyResult> {
  let current: Awaited<ReturnType<typeof getEmployee>>;
  try {
    current = await getEmployee(db, orgId, slug);
  } catch (e) {
    console.error(`[ai-team] could not read ${slug} before saving the dial:`, e);
    return { ok: false, reason: "failed" };
  }
  if (!current) return { ok: false, reason: "not_found" };

  const activated = current.status === "draft";
  const permissions = { ...current.permissions, autonomy: level };

  const { data, error } = await db
    .from("ai_employees")
    .update({ permissions, ...(activated ? { status: "active" } : {}) })
    .eq("organization_id", orgId)
    .eq("id", current.id)
    .select("id"); // ← load-bearing: an RLS refusal is zero rows, not an error
  if (error) {
    console.error(`[ai-team] saving ${slug}'s dial failed:`, error.message);
    return { ok: false, reason: "failed" };
  }
  if (!data || data.length === 0) return { ok: false, reason: "refused" };
  return { ok: true, level, activated };
}
