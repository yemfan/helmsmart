/**
 * An AI-team approval as the owner sees it — the card in the Ask Mark panel
 * and in "Needs your approval" on /home.
 *
 * No directive and no server imports: the cards are client components, and
 * the route, the server action and the home page all build the same view.
 * What an action DOES lives in `./actions/*` (server-only); this file knows
 * only which action keys exist and which of them the owner can edit.
 */
import { sha256Hex } from "./sha256";

export const APPROVAL_STATUSES = ["proposed", "approved", "declined", "executed", "failed", "expired"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

/**
 * What the card shows. `unconfirmed` is not stored: it is an `approved` send
 * that never reported back (see `isUnconfirmed`).
 */
export type ApprovalViewStatus = ApprovalStatus | "unconfirmed";

/** A proposal nobody decided on in a week is stale: the moment it was for has passed. */
export const APPROVAL_TTL_DAYS = 7;

/**
 * How long an approved send may go without recording its outcome before we
 * stop assuming it is still running. Longer than the longest a Vercel
 * function can live (800s), so a row past it is never still in flight.
 */
export const UNCONFIRMED_AFTER_MINUTES = 15;

/** `result.status` on a row the owner dismissed after it never reported back. */
export const UNCONFIRMED_RESULT = "unconfirmed";

/** The longest text the owner may approve (a few SMS segments). */
export const MESSAGE_MAX = 1000;

/**
 * The action keys, in one client-safe place. The registry
 * (`./registry.ts`) is checked against these by `registry.test.ts`, so a new
 * outbound action cannot ship without the card knowing how to show it.
 */
export const ACTION_KEYS = {
  findClients: "find_clients",
  listOverdueInvoices: "list_overdue_invoices",
  listOpenTasks: "list_open_tasks",
  listRecentCalls: "list_recent_calls",
  createTask: "create_task",
  handOffToOwner: "hand_off_to_owner",
  sendInvoiceReminder: "send_invoice_reminder",
  textClient: "text_client",
} as const;

/** Outbound actions: they only ever become approvals, and approving runs them. */
export const APPROVABLE_ACTIONS: ReadonlySet<string> = new Set([ACTION_KEYS.sendInvoiceReminder, ACTION_KEYS.textClient]);

/** Approvals whose text the owner may change before saying yes. */
export const EDITABLE_ACTIONS: ReadonlySet<string> = new Set([ACTION_KEYS.textClient]);

/** What the owner is shown before deciding. Every field optional: it is read back from jsonb. */
export type ApprovalDetails = {
  kind?: "text" | "invoice_reminder" | "manual";
  /** Who it goes to — the id behind `clientName`, part of the fingerprint. */
  clientId?: string | null;
  clientName?: string | null;
  /** Already formatted for display. */
  phone?: string | null;
  email?: string | null;
  message?: string | null;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  amount?: number | null;
  currency?: string | null;
  daysOverdue?: number | null;
  /** A free-text note from the proposer (an autonomy-gated employee's description). */
  note?: string | null;
};

/** One `ai_approvals` row, as selected. */
export type ApprovalRow = {
  id: string;
  organization_id: string;
  employee_slug: string;
  action_key: string;
  params: Record<string, unknown> | null;
  summary: string;
  details: Record<string, unknown> | null;
  status: string;
  source: Record<string, unknown> | null;
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
  executed_at: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
};

export type TeamFace = { slug: string; name: string; avatar: string; role: string };

export type ApprovalView = {
  id: string;
  status: ApprovalViewStatus;
  actionKey: string;
  employee: { slug: string; name: string; avatar: string };
  /** English floor, shown only when the action has no sentence of its own in the bundle. */
  summary: string;
  details: ApprovalDetails;
  /** The registry can run it. False for a row an autonomy-gated employee left for the owner to handle. */
  executable: boolean;
  editable: boolean;
  /** A send that never reported back, which the owner then dismissed — it may or may not have gone. */
  dismissed: boolean;
  createdAt: string;
  /** Why a failed approval failed, in the language of the person who approved it. */
  error: string | null;
};

/** What `decideApproval` answers: the card as it now stands, and why not when it didn't go. */
export type DecideApprovalResult =
  | { ok: true; view: ApprovalView }
  | { ok: false; error: string; view: ApprovalView | null };

type Classifiable = Pick<ApprovalRow, "status" | "created_at" | "action_key" | "decided_at" | "executed_at" | "error">;

export function expiryCutoff(now: Date): string {
  return new Date(now.getTime() - APPROVAL_TTL_DAYS * 86_400_000).toISOString();
}

/** A proposal past its week. Lazy: nothing sweeps them, every read asks this. */
export function isExpired(row: { status: string; created_at: string }, now: Date): boolean {
  if (row.status !== "proposed") return row.status === "expired";
  const created = Date.parse(row.created_at);
  return Number.isFinite(created) && created < now.getTime() - APPROVAL_TTL_DAYS * 86_400_000;
}

export function unconfirmedCutoff(now: Date): string {
  return new Date(now.getTime() - UNCONFIRMED_AFTER_MINUTES * 60_000).toISOString();
}

/**
 * An approved send that never recorded how it went: claimed, then the server
 * died (or the outcome write failed) before `executed_at` or `error` landed.
 * It may already have reached the customer, so it is never retried — the
 * owner is told to check the conversation, and may only dismiss it.
 *
 * Only for actions the team runs: approving a manual row IS its end state.
 */
export function isUnconfirmed(row: Classifiable, now: Date): boolean {
  if (row.status !== "approved" || !APPROVABLE_ACTIONS.has(row.action_key)) return false;
  if (row.executed_at || row.error) return false;
  const since = Date.parse(row.decided_at ?? row.created_at);
  return Number.isFinite(since) && since < now.getTime() - UNCONFIRMED_AFTER_MINUTES * 60_000;
}

export function effectiveStatus(row: Classifiable, now: Date): ApprovalViewStatus {
  if (isExpired(row, now)) return "expired";
  if (isUnconfirmed(row, now)) return "unconfirmed";
  return (APPROVAL_STATUSES as readonly string[]).includes(row.status) ? (row.status as ApprovalStatus) : "failed";
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Read `details` back out of jsonb without trusting its shape. */
export function pickDetails(raw: unknown): ApprovalDetails {
  const d = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const kind = d.kind === "text" || d.kind === "invoice_reminder" || d.kind === "manual" ? d.kind : undefined;
  return {
    kind,
    clientId: str(d.clientId),
    clientName: str(d.clientName),
    phone: str(d.phone),
    email: str(d.email),
    message: str(d.message),
    invoiceId: str(d.invoiceId),
    invoiceNumber: str(d.invoiceNumber),
    amount: num(d.amount),
    currency: str(d.currency),
    daysOverdue: num(d.daysOverdue),
    note: str(d.note),
  };
}

/**
 * What approving would actually do, as one hash: who it goes to (the client's
 * id), where (phone and email), for how much, and the exact message.
 *
 * The card sends this for the details it SHOWED, with the message the owner
 * confirmed; the server recomputes it from the action's preview against the
 * data as it is now, and from the row's stored details. All three must agree
 * or nothing is sent. Names and "days overdue" are left out: they describe
 * the recipient, they don't choose one.
 */
export function approvalFingerprint(actionKey: string, d: ApprovalDetails): string {
  const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
  const amount = typeof d.amount === "number" && Number.isFinite(d.amount) ? d.amount : null;
  return sha256Hex(
    JSON.stringify([
      "approval-v1",
      actionKey,
      text(d.clientId),
      text(d.invoiceId),
      text(d.phone),
      text(d.email),
      amount,
      text(d.currency),
      text(d.message),
    ]),
  );
}

export function toApprovalView(row: ApprovalRow, team: Record<string, TeamFace>, now: Date): ApprovalView {
  const face = team[row.employee_slug];
  const status = effectiveStatus(row, now);
  return {
    id: row.id,
    status,
    actionKey: row.action_key,
    employee: {
      slug: row.employee_slug,
      name: face?.name ?? row.employee_slug,
      avatar: face?.avatar ?? "",
    },
    summary: row.summary,
    details: pickDetails(row.details),
    executable: APPROVABLE_ACTIONS.has(row.action_key),
    editable: EDITABLE_ACTIONS.has(row.action_key),
    dismissed: status === "failed" && row.result?.status === UNCONFIRMED_RESULT,
    createdAt: row.created_at,
    error: row.error,
  };
}
