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
 *
 * The specialists added after v1 — an AI call, a social post, an appointment —
 * decide on fields v1 never had, so those are appended as a SUFFIX that is
 * emitted only when at least one of them is set. An invoice reminder or a text
 * therefore hashes byte-for-byte what it hashed before, and the proposals
 * already waiting for an owner survive this change.
 */
export function fingerprintInput(actionKey: string, d: ApprovalDetails): string {
  const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
  const amount = typeof d.amount === "number" && Number.isFinite(d.amount) ? d.amount : null;
  const base = [
    "approval-v1",
    actionKey,
    text(d.clientId),
    text(d.invoiceId),
    text(d.phone),
    text(d.email),
    amount,
    text(d.currency),
    text(d.message),
  ];
  // What an AI call says and to what end, which network a post goes out on and
  // when, which slot is being taken. `slotLabel`, `reschedulesFrom` and
  // `incomingMessage` are NOT here: they explain the action to the owner, they
  // are not part of it.
  const extra = [
    text(d.note),
    text(d.callPurpose),
    text(d.network),
    text(d.scheduledFor),
    text(d.appointmentType),
    text(d.slotStart),
  ];
  return JSON.stringify(extra.some((v) => v !== null) ? [...base, ...extra] : base);
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
