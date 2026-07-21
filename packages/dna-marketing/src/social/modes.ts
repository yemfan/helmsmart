// Who signs off before AI-written content publishes.
//
// Pure decision logic, no I/O. Extracted from CloseBoss so HelmSmart (and any
// future vertical) inherits the gate rather than re-deriving it — the version
// that shipped there was wrong twice before it was right, and neither mistake
// is obvious from the outside.

/**
 * 'draft'    — nothing is scheduled; the human queues each post by hand.
 * 'review'   — the period is planned and queued at real times, but every post
 *              is held for a human.
 * 'assisted' — an AI reviewer fact-checks each post, clears what it can verify
 *              and holds the rest. Cleared posts still sit in the queue with a
 *              cancel window before their slot.
 * 'auto'     — planned, queued AND published with no check at all.
 */
export type PublishMode = "draft" | "review" | "assisted" | "auto";

const PUBLISH_MODES: readonly PublishMode[] = ["draft", "review", "assisted", "auto"];

export function isPublishMode(v: unknown): v is PublishMode {
  return typeof v === "string" && (PUBLISH_MODES as readonly string[]).includes(v);
}

/**
 * The queue status a mode's posts land in.
 *
 * THIS IS THE WHOLE GATE. The publish worker claims only the publishable
 * status, so any mode that must not publish unattended simply has to produce a
 * different one — there is no second check to write, and therefore none to
 * forget.
 *
 * 'assisted' is deliberately absent from the publishable branch: its status
 * depends on the reviewer's verdict PER POST, resolved at queue time, never
 * from the mode alone. Anything unrecognised also falls through to held, so
 * this function fails closed by construction.
 */
export function queueStatusForMode(
  mode: PublishMode,
): "publishable" | "awaiting_approval" {
  return mode === "auto" ? "publishable" : "awaiting_approval";
}

/** Modes that plan + queue a period (as opposed to 'draft', which only drafts). */
export function modeQueuesPosts(mode: PublishMode): boolean {
  return mode === "auto" || mode === "review" || mode === "assisted";
}

/** True when a mode publishes something no human has read. */
export function modePublishesUnread(mode: PublishMode): boolean {
  return mode === "auto";
}
