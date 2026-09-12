/**
 * The AI team's actions — the one shape every one of them has.
 *
 * Mark (the AI COO) is the captain the owner talks to in Ask Mark. He does not
 * do the work himself: each action belongs to the specialist whose domain it
 * is (Alex chases invoices, Sarah texts clients, Emma knows the calls), and
 * the model is told who owns what.
 *
 * An action never enforces policy on its own. The central runner
 * (`./run-action.ts`) owns the rules:
 *
 *   read      runs at once; returns facts for the model to reason over
 *   internal  runs at once — a task, a hand-off — and is logged as the
 *             employee's run, so it shows in the AI activity feed
 *   outbound  NEVER runs from the model. It is previewed (every entity
 *             re-checked against the caller's org) and parked as an
 *             `ai_approvals` row; it runs only from `decideApproval`, after a
 *             member said yes — and `execute` re-checks the org again then.
 *
 * Industry-agnostic on purpose: HelmSmart core. Ported in spirit from
 * CloseBoss's `lib/boss/tools/`, never imported from it.
 */
import type { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrgRole, Permission } from "@/lib/rbac";
import type { ApprovalDetails, TeamFace } from "./approval-view";

export type RiskClass = "read" | "internal" | "outbound";

/** The Core roster's slugs (`packages/ai-workforce/src/roster.ts`). */
export type EmployeeSlug = "mark" | "tim" | "emily" | "alex" | "sarah" | "emma";

export type Translate = (key: string, opts?: Record<string, unknown>) => string;

export interface ActionContext {
  /** The caller's RLS client — never the service client: RLS is the second fence. */
  db: SupabaseClient;
  orgId: string;
  userId: string | null;
  role: OrgRole | null;
  /** The business's date, `YYYY-MM-DD` (not UTC's). */
  today: string;
  /**
   * The business's IANA timezone. What "8am" and "Thursday morning" mean here:
   * an AI call's quiet hours and an appointment's slot are both the owner's
   * local clock, never the server's.
   */
  timezone: string;
  locale: string;
  currency: string;
  /**
   * Translators for what the OWNER reads: a refusal on an approval card, a
   * task note. What only the MODEL reads (a tool result) stays English.
   */
  i18n: { home: Translate; inbox: Translate; clients: Translate };
  /** The names this business gave its AI employees. */
  team: Record<string, TeamFace>;
  now: Date;
}

/** Something an action touched, for the employee's run record. */
export type Subject = { type: "contact" | "invoice" | "task"; id: string };

export type PreviewResult =
  | { ok: true; summary: string; details: ApprovalDetails; subject?: Subject | null }
  /**
   * `reason` is for the model (English, says what to do next). `ownerReason`
   * is the same refusal for the person approving, in their language — used
   * when the preview is re-run at the moment of approval.
   */
  | { ok: false; reason: string; ownerReason?: string };

/** How an action's work is recorded as its employee's run (`ai_employee_runs`). */
export interface RunRecord {
  status: "succeeded" | "failed" | "escalated";
  channel: string;
  subject?: Subject | null;
  outcome: Record<string, unknown>;
}

export type ActionResult =
  | { status: "done"; summary: string; data?: unknown; run?: RunRecord }
  /** Refused on purpose (policy, validation, an opt-out). Final: the model must not retry it. */
  | { status: "rejected"; reason: string }
  | { status: "failed"; error: string };

/** What the owner may change on a proposal before approving it. */
export type ApprovalEdits = { message?: string };

export interface ActionDef<I = unknown> {
  key: string;
  employee: EmployeeSlug;
  riskClass: RiskClass;
  /** Needed to RUN it: at once for read/internal, at approval for outbound. */
  permission: Permission;
  /** Shown to the model — what it does and when to use it. */
  description: string;
  input: z.ZodType<I, z.ZodTypeDef, unknown>;
  /** The channel an outbound action reaches the customer on (for its run record). */
  channel?: "sms" | "email" | "voice" | "social" | "calendar";
  /** What an outbound action is about, for the specialist's run — known even when the send fails. */
  subjectOf?: (params: I) => Subject | null;
  /**
   * Validate every referenced entity against the caller's org and describe the
   * action in one sentence. Required for outbound; optional elsewhere.
   */
  preview?: (params: I, ctx: ActionContext) => Promise<PreviewResult>;
  execute: (params: I, ctx: ActionContext) => Promise<ActionResult>;
  /** Outbound only: fold the owner's edits into the params (re-validated by `input`). */
  applyEdits?: (params: I, edits: ApprovalEdits) => unknown;
}

// Registry entries are heterogeneous in their input type; the runner parses
// with each entry's own schema before calling it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyAction = ActionDef<any>;

/** Keeps full input inference from the zod schema. */
export function defineAction<S extends z.ZodTypeAny>(
  action: Omit<ActionDef<z.infer<S>>, "input"> & { input: S },
): ActionDef<z.infer<S>> {
  return action as ActionDef<z.infer<S>>;
}
