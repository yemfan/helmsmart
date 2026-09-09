/**
 * Referrals across the office — the pure half.
 *
 * An agent hands a lead to a colleague for a fee. The lead is copied to the
 * receiver's contacts (the sender keeps their own row and the history on
 * it); the receiver accepts or declines; when the deal closes the receiver
 * records the amount, and the fee is on record for both sides and the
 * broker. Who may move a referral where, and what the money comes to,
 * lives here so the action, the panel and a test agree.
 */

export type ReferralStatus = "open" | "accepted" | "declined" | "closed";
export const REFERRAL_STATUSES: readonly ReferralStatus[] = ["open", "accepted", "declined", "closed"];

export type Referral = {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  contactId: string;
  copiedContactId: string | null;
  contactName: string;
  feePct: number;
  note: string | null;
  status: ReferralStatus;
  closedAmount: number | null;
  createdAt: string;
  respondedAt: string | null;
  closedAt: string | null;
};

export const FEE_MAX = 50;
export const NOTE_MAX = 500;

export type ReferralInput = { toAgentId: string; contactId: string; feePct: number; note: string | null };
export type ParseReferral = { ok: true; input: ReferralInput } | { ok: false; field: "toAgentId" | "contactId" | "feePct" | "note"; reason: "required" | "range" | "too_long" | "self" };

export function parseReferralInput(raw: { toAgentId?: unknown; contactId?: unknown; feePct?: unknown; note?: unknown }, fromAgentId: string): ParseReferral {
  const toAgentId = String(raw.toAgentId ?? "").trim();
  if (!toAgentId) return { ok: false, field: "toAgentId", reason: "required" };
  if (toAgentId === fromAgentId) return { ok: false, field: "toAgentId", reason: "self" };
  const contactId = String(raw.contactId ?? "").trim();
  if (!contactId) return { ok: false, field: "contactId", reason: "required" };
  const feePct = Number(raw.feePct);
  if (!Number.isFinite(feePct) || feePct < 0 || feePct > FEE_MAX) return { ok: false, field: "feePct", reason: "range" };
  const note = String(raw.note ?? "").trim() || null;
  if (note && note.length > NOTE_MAX) return { ok: false, field: "note", reason: "too_long" };
  return { ok: true, input: { toAgentId, contactId, feePct: Math.round(feePct * 100) / 100, note } };
}

/** The fee in dollars, to the cent. */
export function feeOf(amount: number, pct: number): number {
  return Math.round(amount * pct) / 100;
}

export type ReferralMove = "accept" | "decline" | "withdraw" | "close";

/** What this agent may do to this referral right now. */
export function movesFor(r: Referral, agentId: string): ReferralMove[] {
  const receiver = r.toAgentId === agentId;
  const sender = r.fromAgentId === agentId;
  if (r.status === "open") {
    if (receiver) return ["accept", "decline"];
    if (sender) return ["withdraw"];
  }
  if (r.status === "accepted" && receiver) return ["close"];
  return [];
}

export function statusAfter(move: ReferralMove): ReferralStatus {
  return move === "accept" ? "accepted" : move === "close" ? "closed" : "declined";
}

export type ReferralSummary = {
  open: number;
  accepted: number;
  closed: number;
  declined: number;
  closedVolume: number;
  fees: number;
};

export function summarizeReferrals(rows: readonly Referral[]): ReferralSummary {
  const s: ReferralSummary = { open: 0, accepted: 0, closed: 0, declined: 0, closedVolume: 0, fees: 0 };
  for (const r of rows) {
    s[r.status] += 1;
    if (r.status === "closed" && r.closedAmount != null) {
      s.closedVolume += r.closedAmount;
      s.fees += feeOf(r.closedAmount, r.feePct);
    }
  }
  s.fees = Math.round(s.fees * 100) / 100;
  return s;
}

/** Newest first; the ones waiting on this agent ahead of everything else. */
export function orderForAgent(rows: readonly Referral[], agentId: string): Referral[] {
  const weight = (r: Referral) => (movesFor(r, agentId).length > 0 ? 0 : 1);
  return [...rows].sort((a, b) => weight(a) - weight(b) || b.createdAt.localeCompare(a.createdAt));
}
