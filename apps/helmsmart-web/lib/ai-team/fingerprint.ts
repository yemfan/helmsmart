/**
 * The approval fingerprint: what approving would actually do, as one hash.
 *
 * The card sends this for the details it SHOWED, with the message the owner
 * confirmed; the server recomputes it from the action's preview against the
 * data as it is now, and from the row's stored details. All three must agree
 * or nothing is sent.
 *
 * Both sides hash the SAME string — `fingerprintInput` below — with the same
 * algorithm, using each runtime's own SHA-256: `crypto.subtle` in the browser
 * (here) and `node:crypto` on the server (`./fingerprint.server`). Neither
 * side owns the serialization, so neither can drift from the other; the
 * fixtures in `__tests__/fingerprint.test.ts` pin the exact hex.
 *
 * `crypto.subtle` needs a secure context, which HelmSmart always has:
 * production is HTTPS, and `next dev` is localhost — a secure origin by
 * definition. If someone ever serves this app over plain http from a LAN
 * address, hashing throws and nothing can be approved from that page; the
 * fix is a hostname the browser trusts, not a hand-written digest.
 */
import type { ApprovalDetails } from "./approval-view";

/**
 * The exact bytes both sides hash: who it goes to (the client's id), where
 * (phone and email), for how much, and the exact message. Names and "days
 * overdue" are left out — they describe the recipient, they don't choose one.
 *
 * Changing anything here invalidates every proposal already waiting for an
 * owner, so the shape is versioned and the order is fixed.
 */
export function fingerprintInput(actionKey: string, d: ApprovalDetails): string {
  const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
  const amount = typeof d.amount === "number" && Number.isFinite(d.amount) ? d.amount : null;
  return JSON.stringify([
    "approval-v1",
    actionKey,
    text(d.clientId),
    text(d.invoiceId),
    text(d.phone),
    text(d.email),
    amount,
    text(d.currency),
    text(d.message),
  ]);
}

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");

/**
 * The card's side, in the browser. Async because Web Crypto is: the caller
 * (`components/approval-card.tsx`) awaits it before sending the decision.
 */
export async function approvalFingerprintAsync(actionKey: string, d: ApprovalDetails): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("crypto.subtle is unavailable — this page must be served over https or from localhost");
  const bytes = new TextEncoder().encode(fingerprintInput(actionKey, d));
  return toHex(await subtle.digest("SHA-256", bytes));
}
