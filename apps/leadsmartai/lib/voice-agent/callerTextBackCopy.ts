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
 * Did the caller actually say anything?
 *
 * Retell transcripts are line-oriented, "Agent:" / "User:" per turn. The agent
 * always speaks — she opens the call — so her turns say nothing about whether a
 * human engaged.
 */
export function callerSpoke(transcript: string | null | undefined): boolean {
  return /^\s*(user|caller)\s*:\s*\S/im.test(transcript || "");
}
