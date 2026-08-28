/**
 * Should the AI answer this inbound text?
 *
 * The old rule was "not within N minutes of our last reply", defaulting to ten.
 * But this code only runs when a human has just written to us, so that rule
 * silenced the one case it should never silence: the AI asked "which area or
 * budget?", the lead replied "Rowland Heights" thirty seconds later, and got
 * nothing back. A throttle meant to stop runaway loops was punishing engagement.
 *
 * What actually needs preventing is a loop — an autoresponder on the other end
 * volleying with us, or a wedged client resending. Neither is "a person replied
 * quickly", so neither is measured by time since we last spoke.
 *
 * Two guards instead:
 *   - a short floor, so a machine answering instantly cannot start a hot loop;
 *   - a cap on replies within a window, so even a fast exchange settles down
 *     rather than running forever.
 *
 * Pure, so the decision can be tested without a webhook, a database or Twilio.
 */

export type ConversationMessage = {
  role: string;
  content?: string;
  created_at?: string;
};

export type ReplyGateOptions = {
  /** Minimum gap after our own last reply. Guards against a hot loop only. */
  floorMs?: number;
  /** How far back the burst cap looks. */
  windowMs?: number;
  /** Most AI replies allowed inside that window. */
  maxRepliesPerWindow?: number;
};

export const DEFAULT_FLOOR_MS = 20_000;
export const DEFAULT_WINDOW_MS = 10 * 60 * 1000;
export const DEFAULT_MAX_REPLIES = 6;

export function shouldAiReply(
  messages: ConversationMessage[],
  now: number,
  opts: ReplyGateOptions = {},
): { reply: boolean; reason: string } {
  const floorMs = opts.floorMs ?? DEFAULT_FLOOR_MS;
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
  const maxReplies = opts.maxRepliesPerWindow ?? DEFAULT_MAX_REPLIES;

  const ours = (messages ?? []).filter((m) => m.role === "assistant");
  const stamps = ours
    .map((m) => (m.created_at ? new Date(m.created_at).getTime() : NaN))
    .filter((t) => Number.isFinite(t)) as number[];

  const lastOurs = stamps.length ? Math.max(...stamps) : null;
  if (lastOurs != null && now - lastOurs < floorMs) {
    return { reply: false, reason: "replied moments ago — guarding against a loop" };
  }

  const inWindow = stamps.filter((t) => now - t < windowMs).length;
  if (inWindow >= maxReplies) {
    return {
      reply: false,
      reason: `${inWindow} replies in the last ${Math.round(windowMs / 60000)} minutes — handing to a person`,
    };
  }

  return { reply: true, reason: "they wrote to us" };
}
