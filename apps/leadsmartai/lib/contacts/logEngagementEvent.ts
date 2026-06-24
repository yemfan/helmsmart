import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { recomputeLeadRating } from "@/lib/contacts/recomputeLeadRating";

/**
 * Log a single engagement event to `contact_events` and refresh the contact's
 * composite lead rating.
 *
 * This is the generic "a user did something" entry point. Any activity source
 * (email open/click/reply, a public link click, a portal action, …) can call
 * this and immediately feed the lead rating — as long as the event_type either
 * carries a weight in EVENT_WEIGHTS (scoreBehavior → engagement_score) or is
 * handled as a discrete signal in recomputeLeadRating.
 *
 * Uses the service-role client on purpose: callers include UNauthenticated
 * tracking endpoints (open pixel, click redirect) hit by email clients, where
 * the session client would be blocked by RLS. `contact_events.agent_id` is
 * NOT NULL, so we resolve it off the contact and no-op if it can't be found.
 *
 * Best-effort — never throws (tracking pixels/redirects must not 500).
 */
export async function logEngagementEvent(
  contactId: string,
  eventType: string,
  opts: { source?: string; payload?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    const { data } = await supabaseAdmin
      .from("contacts")
      .select("agent_id")
      .eq("id", contactId)
      .maybeSingle();
    const agentId = (data as { agent_id?: unknown } | null)?.agent_id ?? null;
    if (agentId == null) return; // contact_events.agent_id is NOT NULL

    await supabaseAdmin.from("contact_events").insert({
      contact_id: contactId,
      agent_id: agentId as never,
      event_type: eventType,
      source: opts.source ?? "tracking",
      payload: (opts.payload ?? {}) as never,
    } as never);

    await recomputeLeadRating(contactId);
  } catch {
    /* best-effort — tracking endpoints must stay resilient */
  }
}
