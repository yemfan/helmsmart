import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { INACTIVE_FOLLOWUP_PREFIX } from "@/lib/briefing/inactiveLeadNudge";

/**
 * Single source of truth for "the agent just did something with
 * this contact." Called from SMS send, email send, showing create,
 * offer create, inbound email matcher — anywhere a real-world
 * activity attaches to a contact.
 *
 * Two side effects, both best-effort (DB errors log + return
 * silently so the calling action never fails because of a
 * housekeeping update):
 *
 *   1. contacts.last_activity_at ← now()
 *      Keeps the morning briefing's "inactive lead" filter honest.
 *      Without this, last_activity_at only ever reflects creation
 *      time (PR #385's default) — so even agents who actively work
 *      a contact would still trip the 7-day inactive filter.
 *
 *   2. crm_tasks → 'done' for any open "Follow up with inactive
 *      lead: …" tasks belonging to this contact. The agent is
 *      doing the follow-up right now; the to-do is stale the
 *      moment they hit send. Status flips to 'done' and
 *      completed_at gets stamped.
 *
 * Matching the right tasks:
 *   - source = 'briefing' (only auto-generated rows; never touch
 *     manual tasks even if the title coincidentally matches)
 *   - contact_id = the supplied contact (or title ILIKE …<name>
 *     fallback if contact_id is null — legacy rows from before
 *     dailyBriefing started setting contact_id)
 *   - status = 'open' (don't unintentionally reopen anything)
 *   - title prefix = 'Follow up with inactive lead:' (don't
 *     close hot-lead call tasks; those still need attention)
 *
 * @param agentId  Authoritative scope. Required.
 * @param contactId  The contact whose activity timestamp should
 *                   bump + whose inactive-follow-up tasks should
 *                   close.
 * @param opts.contactName  Optional fallback for legacy briefing
 *                          rows that didn't set contact_id. The
 *                          briefing job titles tasks as
 *                          `Follow up with inactive lead: <name>`
 *                          so we can match on title when we know
 *                          the contact's display name.
 */
export async function markContactActivity(
  agentId: string,
  contactId: string,
  opts?: { contactName?: string | null },
): Promise<void> {
  if (!contactId) return;

  // 1. Bump the freshness timestamp.
  try {
    await supabaseAdmin
      .from("contacts")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", contactId)
      .eq("agent_id", agentId);
  } catch (e) {
    console.warn(
      "[markContactActivity] last_activity_at update failed:",
      e instanceof Error ? e.message : e,
    );
  }

  // 2. Auto-complete the matching open briefing tasks.
  try {
    const now = new Date().toISOString();
    // Primary match: contact_id (set by post-PR briefings)
    await supabaseAdmin
      .from("crm_tasks")
      .update({ status: "done", completed_at: now, updated_at: now })
      .eq("agent_id", agentId)
      .eq("source", "briefing")
      .eq("contact_id", contactId)
      .eq("status", "open")
      .ilike("title", `${INACTIVE_FOLLOWUP_PREFIX}%`);

    // Fallback for legacy briefing rows where contact_id is NULL
    // (the briefing job set null until contact_id-aware insert
    // landed). Match on title ILIKE `…<name>` so we still close
    // them out.
    const name = opts?.contactName?.trim();
    if (name) {
      await supabaseAdmin
        .from("crm_tasks")
        .update({ status: "done", completed_at: now, updated_at: now })
        .eq("agent_id", agentId)
        .eq("source", "briefing")
        .is("contact_id", null)
        .eq("status", "open")
        .ilike("title", `${INACTIVE_FOLLOWUP_PREFIX} ${name}%`);
    }
  } catch (e) {
    console.warn(
      "[markContactActivity] auto-complete failed:",
      e instanceof Error ? e.message : e,
    );
  }
}
