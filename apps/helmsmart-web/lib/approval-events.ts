/**
 * "The number of approvals waiting just changed" — so the count on the Ask
 * Mark launcher and the sidebar button moves the moment a proposal is made or
 * decided, without waiting for the next navigation.
 *
 * The count itself comes from the server (the dashboard layout reads it); this
 * only nudges it between renders. A server re-render replaces whatever the
 * nudges added up to, so the two can never drift for long.
 *
 * No directive and no server imports: the panel, the sidebar, the approval
 * cards and the node tests all import it.
 */

export const APPROVALS_CHANGED_EVENT = "helmsmart:approvals-changed";

export interface ApprovalsChangedDetail {
  /** +1 for a new proposal, -1 for one decided or expired. */
  delta: number;
}

function windowTarget(): EventTarget | null {
  return typeof window === "undefined" ? null : window;
}

export function announceApprovalsChanged(delta: number, target: EventTarget | null = windowTarget()): void {
  if (!delta) return;
  target?.dispatchEvent(new CustomEvent<ApprovalsChangedDetail>(APPROVALS_CHANGED_EVENT, { detail: { delta } }));
}

/** Subscribe; returns the unsubscribe, for a `useEffect`. */
export function onApprovalsChanged(
  handler: (delta: number) => void,
  target: EventTarget | null = windowTarget(),
): () => void {
  if (!target) return () => {};
  const listener = (e: Event) => {
    const delta = (e as CustomEvent<Partial<ApprovalsChangedDetail> | null>).detail?.delta;
    if (typeof delta === "number" && Number.isFinite(delta) && delta !== 0) handler(delta);
  };
  target.addEventListener(APPROVALS_CHANGED_EVENT, listener);
  return () => target.removeEventListener(APPROVALS_CHANGED_EVENT, listener);
}

/** The count after a nudge — never below zero. */
export function applyApprovalDelta(count: number, delta: number): number {
  return Math.max(0, count + delta);
}
