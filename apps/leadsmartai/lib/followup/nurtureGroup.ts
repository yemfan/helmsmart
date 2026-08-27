import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * The tag that makes the nurture cohort a real, visible group.
 *
 * A status buried on a record is something nobody looks at. A tag is a filter:
 * the agent can pull up everyone in nurture, see how many there are, and send
 * the whole group a market update in one go — which is the point of not
 * dropping these people.
 *
 * `lead_tags_json` is a plain string array; this is the existing grouping
 * mechanism rather than a new one.
 */
export const NURTURE_TAG = "nurture";

function parseTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

/**
 * Move a lead out of active follow-up and into the nurture group.
 *
 * Not an ending. Active chasing stops; periodic updates continue, and the lead
 * stays visible as a cohort the agent can work as a whole. Someone who isn't
 * ready this quarter may be ready next year, and a market update every couple of
 * months costs nothing against forgetting them entirely.
 *
 * Idempotent — the drip may reach this conclusion on several runs before the
 * ladder actually stops, and re-tagging must not produce duplicates or a stream
 * of identical audit events.
 *
 * Returns true only when this call is what moved them, so the caller can log
 * the transition once rather than every time it re-derives it.
 */
export async function moveToNurtureGroup(input: {
  contactId: string;
  agentId: string;
  /** Why the ladder ended — shown to the agent, so plain language. */
  reason: string;
}): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from("contacts")
      .select("lead_tags_json")
      .eq("id", input.contactId as never)
      .eq("agent_id", input.agentId as never)
      .maybeSingle();
    if (error || !data) return false;

    const tags = parseTags((data as { lead_tags_json?: unknown }).lead_tags_json);
    if (tags.includes(NURTURE_TAG)) return false; // already in the group

    const { error: writeErr } = await supabaseAdmin
      .from("contacts")
      .update({
        lead_tags_json: [...tags, NURTURE_TAG],
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.contactId as never)
      .eq("agent_id", input.agentId as never);
    if (writeErr) {
      console.error("[nurture-group] tag write failed:", writeErr.message);
      return false;
    }

    // Audit trail, so "why did this lead go quiet in my pipeline?" has an answer.
    try {
      await supabaseAdmin.from("contact_events").insert({
        contact_id: input.contactId,
        agent_id: input.agentId,
        event_type: "moved_to_nurture",
        payload: { reason: input.reason },
      } as Record<string, unknown>);
    } catch {
      /* the tag is what matters; the event is a nicety */
    }
    return true;
  } catch (e) {
    console.error("[nurture-group] failed:", e instanceof Error ? e.message : e);
    return false;
  }
}

/** Take a lead back out of nurture — they replied, or the agent re-engaged them. */
export async function removeFromNurtureGroup(contactId: string, agentId: string): Promise<void> {
  try {
    const { data } = await supabaseAdmin
      .from("contacts")
      .select("lead_tags_json")
      .eq("id", contactId as never)
      .eq("agent_id", agentId as never)
      .maybeSingle();
    if (!data) return;
    const tags = parseTags((data as { lead_tags_json?: unknown }).lead_tags_json);
    if (!tags.includes(NURTURE_TAG)) return;
    await supabaseAdmin
      .from("contacts")
      .update({
        lead_tags_json: tags.filter((t) => t !== NURTURE_TAG),
        updated_at: new Date().toISOString(),
      })
      .eq("id", contactId as never)
      .eq("agent_id", agentId as never);
  } catch (e) {
    console.error("[nurture-group] remove failed:", e instanceof Error ? e.message : e);
  }
}
