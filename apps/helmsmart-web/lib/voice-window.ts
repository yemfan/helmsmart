import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mergeCallLog,
  summarizeCalls,
  type CallLike,
  type SessionLike,
  type VoiceStats,
} from "@/lib/voice-stats";

/**
 * The AI Receptionist's totals for a window, read from the database.
 * lib/voice-stats decides what a call is and how it counts; this is the one
 * place that fetches the rows it decides over, so every screen that shows a
 * voice number — /voice and the Marketing overview — shows the same one.
 * Callers pass voicePeriodStart(org timezone) so the window is the labelled one.
 */

/** Rows per request when counting; fetchAll keeps asking until a page comes back short. */
const PAGE_SIZE = 1000;
/** jsonb containment: the transcript holds at least one turn from the caller. */
const CALLER_SPOKE = JSON.stringify([{ role: "user" }]);

/** Every row a query matches, one page at a time — counted, never capped. */
async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) return out;
  }
}

async function readWindowStats(db: SupabaseClient, orgId: string, sinceIso: string): Promise<VoiceStats> {
  const [sessions, spoke, calls] = await Promise.all([
    fetchAll<Omit<SessionLike, "spoke">>((from, to) =>
      db
        .from("voice_sessions")
        .select("id, call_sid, created_at, status, booked_event_id, duration_seconds")
        .eq("organization_id", orgId)
        .eq("direction", "inbound")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchAll<{ id: string }>((from, to) =>
      db
        .from("voice_sessions")
        .select("id")
        .eq("organization_id", orgId)
        .eq("direction", "inbound")
        .gte("created_at", sinceIso)
        .contains("messages", CALLER_SPOKE)
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchAll<CallLike>((from, to) =>
      db
        .from("calls")
        .select("id, twilio_call_sid, called_at, status, auto_replied")
        .eq("organization_id", orgId)
        .gte("called_at", sinceIso)
        .order("called_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
  ]);
  const spokeIds = new Set(spoke.map((r) => r.id));
  return summarizeCalls(mergeCallLog(sessions.map((s) => ({ ...s, spoke: spokeIds.has(s.id) })), calls));
}

/**
 * The totals since `since`: every inbound AI session and every missed-call row,
 * merged into one row per call and classified by lib/voice-stats. Outbound AI
 * calls are excluded.
 *
 * Null when a table could not be read — a total built from half the rows would
 * be a wrong number, not a smaller one, so the screen says it couldn't load
 * rather than show a zero it never counted.
 */
export async function loadWindowStats(db: SupabaseClient, orgId: string, since: Date): Promise<VoiceStats | null> {
  try {
    return await readWindowStats(db, orgId, since.toISOString());
  } catch (e) {
    console.error("[voice] loading call totals failed", e);
    return null;
  }
}
