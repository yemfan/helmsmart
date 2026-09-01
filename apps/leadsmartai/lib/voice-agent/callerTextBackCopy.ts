/**
 * Pure copy + transcript helpers for the missed-call text-back.
 *
 * Separate from callerTextBack.ts because that one is `server-only` and so
 * cannot be imported from a test; these two are the parts worth testing.
 */

/** The follow-up text a caller gets when we did not actually speak with them. */
export function missedCallTextBack(orgName: string, agentName?: string | null): string {
  const who = agentName?.trim()
    ? `This is ${agentName.trim()}, your virtual assistant.`
    : `This is our virtual assistant.`;
  return `Thanks for calling ${orgName}! ${who} We'll follow up shortly — reply here anytime. Reply STOP to opt out.`;
}

/**
 * Did the call reach a natural end?
 *
 * The receptionist closes a finished conversation by invoking `end_call`, and
 * Retell records that as `agent_hangup`. Every other ending — the caller hanging
 * up mid-sentence, silence timing out, voicemail, an error, hitting the duration
 * cap — means she never got to wrap up, whatever was or wasn't said.
 *
 * Checked against twelve real calls: `agent_hangup` and an `end_call`
 * invocation matched on every one, so the disconnection reason alone is enough
 * and we don't need to dig through the tool calls.
 *
 * Anything unrecognised counts as NOT normal. A reason we've never seen is far
 * more likely to be a new failure mode than a new way of succeeding, and the
 * cost of being wrong is one extra courtesy text.
 */
export function finishedNormally(disconnectionReason: string | null | undefined): boolean {
  return (disconnectionReason || "").trim().toLowerCase() === "agent_hangup";
}
