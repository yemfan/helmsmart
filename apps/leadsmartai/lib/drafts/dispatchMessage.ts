/**
 * Say in plain words what happened to a draft the agent tried to send.
 *
 * The screen printed the raw outcome code — "Deferred: paused_on_reply" — which
 * names an enum member rather than telling anyone what the app did or why. Each
 * of these is a deliberate, explicable decision, so it should read as one.
 *
 * Deliberately does not say "try again" for the cases a retry cannot fix: an
 * opt-out, a missing number and a stale draft all need the agent to do
 * something different, and inviting a retry only wastes their time.
 *
 * Pure, so the wording can be tested without a browser.
 */

import type { DispatchReason } from "./sender";

export function dispatchOutcomeMessage(
  reason: DispatchReason | string | undefined,
  detail?: string,
): string {
  switch (reason) {
    case "sent":
      return "Sent.";

    // --- waiting for a better moment ---
    case "paused_on_reply":
      return "Held back — they have written to you recently, so this is waiting rather than talking over them.";
    case "quiet_hours":
      return "Held until your sending hours start again.";
    case "sunday_morning":
      return "Held until Sunday midday — your settings keep Sunday mornings clear.";
    case "chinese_new_year":
      return "Held over Chinese New Year.";
    case "per_contact_cap":
      return "Held until tomorrow — this contact has already had the most messages you allow in a day.";

    // --- will not send without a change ---
    case "do_not_contact":
      return "Not sent — this contact has opted out of messages on this channel.";
    case "missing_address":
      return "Not sent — there is no phone number or email address on this contact. Add one, then redraft.";
    case "stale":
      return "Not sent — this was approved too long ago to still read as current. Redraft it.";
    case "send_failed":
      return detail ? `Could not send: ${detail}` : "Could not send.";

    default:
      // A reason we have not written words for yet. Show it rather than swallow
      // it — an unexplained silence is worse than an unfamiliar word.
      return reason ? `Not sent (${reason}).` : "Nothing to send.";
  }
}
