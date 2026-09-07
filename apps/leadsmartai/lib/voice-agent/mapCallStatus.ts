/**
 * Map a Retell call outcome to the call_logs status the badge renders.
 *
 * The old mapping only looked for a few words in the disconnection reason
 * and called everything else "completed" — including calls Retell itself
 * reports as `not_connected`. So a call the carrier rejected before it rang
 * (reason `user_declined`, 0 seconds) sat in the call log as a completed
 * call, and three days of "the receptionist can't dial out" looked like
 * three days of very short conversations.
 *
 * Rule: a call that never connected is never "completed". Reasons are the
 * documented Retell values (https://docs.retellai.com/api-references/get-call).
 */
export type CallLogStatus = "completed" | "failed" | "no_answer" | "busy" | "voicemail";

export function mapCallStatus(
  callStatus: string | undefined,
  reason: string | undefined,
): CallLogStatus {
  const r = (reason || "").toLowerCase();

  if (r.includes("no_answer")) return "no_answer";
  if (r.includes("busy")) return "busy";
  if (r.includes("voicemail") || r.includes("machine")) return "voicemail";

  if (
    r.includes("failed") ||
    r.startsWith("error") ||
    r === "user_declined" ||
    r === "invalid_destination" ||
    r === "registered_call_timeout" ||
    r === "sip_routing_error" ||
    r.startsWith("telephony_provider") ||
    r === "no_valid_payment" ||
    r === "concurrency_limit_reached" ||
    callStatus === "error"
  ) {
    return "failed";
  }

  // Whatever the reason says, a call Retell marks as never having connected
  // did not complete. This is the catch-all that was missing.
  if (callStatus === "not_connected") return "failed";

  // user_hangup, agent_hangup, call_transfer, inactivity, max_duration_reached…
  return "completed";
}
