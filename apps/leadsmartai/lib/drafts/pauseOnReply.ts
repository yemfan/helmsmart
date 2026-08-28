/**
 * "Pause on reply" — stop sending queued nurture at someone who has just
 * written back.
 *
 * The sender carried this as a stub that always returned false, with a TODO
 * waiting on "the thread model being unified across leads + sphere contacts".
 * That unification has since happened: `message_drafts.contact_id` and
 * `sms_messages.contact_id` both point at `contacts`, so the inbound side is
 * readable now. Until then the agent could set a pause-on-reply window in the
 * UI and it did nothing at all — the setting looked honoured and was not.
 *
 * Pure, so the window arithmetic can be tested without a database.
 */

export function pausedUntil(
  latestInboundAt: string | Date | null | undefined,
  pauseDays: number,
): Date | null {
  if (!latestInboundAt) return null;
  if (!Number.isFinite(pauseDays) || pauseDays <= 0) return null;

  const at = latestInboundAt instanceof Date ? latestInboundAt : new Date(latestInboundAt);
  const ms = at.getTime();
  if (!Number.isFinite(ms)) return null;

  return new Date(ms + pauseDays * 24 * 60 * 60 * 1000);
}

/**
 * Is a queued message still held back because they replied?
 *
 * A reply is a live conversation, and dropping a pre-written nurture line into
 * one reads as though nobody is listening.
 */
export function isPausedOnReply(
  latestInboundAt: string | Date | null | undefined,
  pauseDays: number,
  now: Date,
): boolean {
  const until = pausedUntil(latestInboundAt, pauseDays);
  return until != null && now.getTime() < until.getTime();
}
