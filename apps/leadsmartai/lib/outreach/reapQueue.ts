/**
 * Queue-state rules for the outreach-scheduler cron. Pure functions, kept out
 * of the route so they are testable — the route owns the DB calls, this owns
 * the decisions.
 *
 * `scheduled_actions.status` has one transient value, 'sending', meaning "a
 * cron tick has claimed this batch". The claim and the outcome are two separate
 * writes, so anything that kills the run in between — a function timeout, a
 * deploy, an OOM — leaves the row claimed forever:
 *
 *   - the drain only selects status='scheduled', and
 *   - nothing anywhere else selects 'sending'.
 *
 * So the row is invisible to the cron and reads "sending" in the dashboard for
 * ever. This is the same shape that stranded ten `scheduled_posts` rows before
 * publishQueue.ts was written; this rail simply had not been looked at yet.
 *
 * WHY THIS NEVER REQUEUES, unlike the publish queue.
 *
 * A batch is a list of contacts, and the send loop walks it one at a time. If
 * the run dies after contact five of twelve, five people have already had a
 * phone call, a text, or an email — and putting the row back to 'scheduled'
 * would call and text those five a second time, under the agent's name. A
 * duplicate outbound call to a client is a worse outcome than the stall it
 * would be fixing, so a stranded batch is always failed, never retried.
 *
 * That is only tolerable because the route now records progress per contact as
 * it goes: the failure can say who was actually reached instead of leaving the
 * agent to guess. Automatic resumption would need that same progress read back
 * to skip the reached ones — worth doing, and deliberately not done here.
 */

/**
 * How long a batch may sit in 'sending' before the run that claimed it is
 * presumed dead.
 *
 * The cron ticks every 15 minutes and the route caps itself at 300s, so a live
 * batch cannot still be working after 45 minutes — that is three ticks and
 * six times the route's own ceiling. Generous on purpose: reaping a batch that
 * is genuinely still sending would mark delivered outreach as failed.
 */
export const STALE_SENDING_MS = 45 * 60 * 1000;

/**
 * Wall-clock budget for one tick's sending. Held under the route's maxDuration
 * so the loop stops on its own terms.
 *
 * This is the half that prevents stranding rather than cleaning up after it:
 * a run that stops before the platform kills it leaves nothing claimed. With
 * 50 batches per run, each a list of calls paced at 250ms plus dial latency,
 * being killed mid-batch is the expected case, not an unlucky one.
 */
export const DRAIN_BUDGET_MS = 240 * 1000;

/** True when there is not enough budget left to safely start another batch. */
export function outOfDrainBudget(startedAtMs: number, now: number): boolean {
  return now - startedAtMs >= DRAIN_BUDGET_MS;
}

/** What a partially-written result looks like while a batch is in flight. */
export type PartialResult = {
  sent?: number | null;
  failed?: number | null;
  total?: number | null;
} | null;

export type StaleSendingRow = {
  id: string;
  /** ISO. Last write to the row — i.e. when it was claimed, or last progress. */
  claimed_at: string | null;
  /** Progress recorded so far, when the route got far enough to write any. */
  result: PartialResult;
};

export type OutreachReapDecision =
  | { action: "leave" }
  | { action: "fail"; reason: string };

/**
 * What to do with a batch sitting in 'sending'.
 *
 * `leave` means a live run may still be working it — never touch those, or a
 * batch mid-flight gets recorded as failed while its messages go out.
 */
export function outreachReapDecision(
  row: StaleSendingRow,
  now: number,
): OutreachReapDecision {
  const claimedAt = row.claimed_at ? Date.parse(row.claimed_at) : NaN;
  // No usable timestamp: don't guess, and don't strand it either — the next
  // write gives it one. Leaving is the safe half of the ambiguity.
  if (!Number.isFinite(claimedAt)) return { action: "leave" };
  if (now - claimedAt < STALE_SENDING_MS) return { action: "leave" };

  return { action: "fail", reason: describeInterruption(row.result) };
}

/**
 * The sentence the agent reads. It has to answer "did my clients hear from me
 * or not", because that decides whether resending is a follow-up or a repeat.
 */
export function describeInterruption(result: PartialResult): string {
  const sent = Number(result?.sent ?? 0);
  const total = Number(result?.total ?? 0);

  if (Number.isFinite(sent) && sent > 0 && Number.isFinite(total) && total > 0) {
    return (
      `This outreach was interrupted after reaching ${sent} of ${total} contacts. ` +
      `The rest were not contacted. Resend to the remainder only — resending the whole ` +
      `batch would contact those ${sent} a second time.`
    );
  }
  if (Number.isFinite(total) && total > 0) {
    return (
      `This outreach was interrupted before anyone was contacted (0 of ${total}). ` +
      `It is safe to reschedule the whole batch.`
    );
  }
  // No progress was recorded at all — the run died before its first write.
  return (
    "This outreach was interrupted and we cannot tell how far it got, so some " +
    "contacts may already have been reached. Check the conversation history for " +
    "these contacts before resending."
  );
}
