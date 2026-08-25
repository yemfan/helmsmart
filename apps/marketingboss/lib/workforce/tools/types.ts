import type { WorkerId } from "@/lib/workforce/workers";

/**
 * The workforce tool contract (3.0 Phase 0).
 *
 * A tool wraps ONE capability that already exists in lib/ behind a typed
 * contract Nina's agent loop can call. Tools never reimplement a capability and
 * never enforce policy themselves beyond what their underlying rail already
 * does — the executor owns the rails (credit ceilings, approval gating,
 * idempotency, run accounting).
 *
 * Shape follows CloseBoss's proven Boss v2 tool layer, with two deliberate
 * differences: no zod (this app hand-writes JSON Schema everywhere, see
 * lib/ai.ts), and `generate` is its own risk class because in MarketingBoss a
 * single tool call can spend 20+ real credits.
 */

/**
 * What kind of consequence a tool has. Drives gating, not capability:
 *  - research  — reads or searches. Free or near-free, never gated.
 *  - draft     — writes text into our own DB. Cheap, reversible.
 *  - generate  — SPENDS CREDITS on fal.ai. Gated by the credit ceiling.
 *  - publish   — puts something in front of the public. Gated by approval.
 */
export type RiskClass = "research" | "draft" | "generate" | "publish";

/** Per-run budget and rails state. One instance per Nina run, shared across steps. */
export type ToolRunState = {
  toolCalls: number;
  maxToolCalls: number;
  /** Credits spent by generate-class tools so far in this run. */
  creditsSpent: number;
  /** Hard ceiling for this run; generate tools are refused past it. */
  maxCredits: number | null;
};

export const DEFAULT_MAX_TOOL_CALLS = 20;

export function newRunState(opts?: { maxToolCalls?: number; maxCredits?: number | null }): ToolRunState {
  return {
    toolCalls: 0,
    maxToolCalls: opts?.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS,
    creditsSpent: 0,
    maxCredits: opts?.maxCredits ?? null,
  };
}

export type ToolContext = {
  /** Whose account this runs against. Every tool scopes its queries by it. */
  userId: string;
  /** The Nina run this execution belongs to — half the idempotency key. */
  runId: string;
  /** Position within the run — the other half. */
  stepIndex: number;
  /** Mission this run serves, when there is one. */
  missionId?: string | null;
  runState: ToolRunState;
  /** Injectable clock (tests). Defaults to `new Date()` at execution time. */
  now?: Date;
  /**
   * Set only by the approval path, after the owner explicitly approved this
   * exact step: a publish-class tool executes instead of proposing.
   */
  approvedByOwner?: boolean;
};

export type ToolOutcome =
  | {
      status: "completed";
      /** One plain sentence for the activity feed. Written to the owner, not to the model. */
      summary: string;
      /** Link to what was produced, when there is one. */
      artifactUrl?: string | null;
      /** Credits this call actually spent. */
      creditsSpent?: number;
      /** Structured result handed back to the model on the next turn. */
      data?: unknown;
    }
  | {
      status: "pending_approval";
      summary: string;
      /** What was prepared — a draft row id, a proposed publish — surfaced for the decision. */
      proposal?: unknown;
    }
  | { status: "rejected"; reason: string }
  | {
      status: "failed";
      /** Friendly and actionable. Never a raw platform error or a stack trace. */
      error: string;
      /** True when retrying could plausibly succeed (transient/network). */
      retryable?: boolean;
    };

/**
 * A callable capability. `inputSchema` is a hand-written JSON Schema object —
 * passed to the model verbatim as the tool's input_schema, so it must be a
 * valid Anthropic tool schema (object, properties, required, additionalProperties).
 */
export type WorkforceTool<I = unknown> = {
  name: string;
  /** Who gets credited in the activity feed when this runs. */
  worker: WorkerId;
  /** Shown to the model: what it does AND when to reach for it. */
  description: string;
  inputSchema: Record<string, unknown>;
  riskClass: RiskClass;
  /**
   * Best-effort credit cost before running, so Nina can warn and the executor
   * can enforce a ceiling. Return 0 for anything that doesn't hit fal.ai.
   */
  estimateCredits?: (input: I) => number;
  /** Runtime guard — the model can send anything. Return a friendly message on failure. */
  parseInput: (raw: unknown) => { ok: true; value: I } | { ok: false; error: string };
  /** The action. For publish-class tools the executor calls this only when allowed to send. */
  execute: (ctx: ToolContext, input: I) => Promise<ToolOutcome>;
  /**
   * Approval path for publish-class tools: park something durable (a draft row,
   * a scheduled post) and send nothing. The executor falls back to a generic
   * pending_approval outcome when a tool doesn't implement it.
   */
  propose?: (ctx: ToolContext, input: I) => Promise<ToolOutcome>;
};

/** Keeps full input inference at the definition site. */
export function defineTool<I>(tool: WorkforceTool<I>): WorkforceTool<I> {
  return tool;
}

// ── small input-validation helpers ───────────────────────────────────
// Deliberately hand-rolled: this app has no schema library, and the checks a
// tool actually needs are narrow. Each returns a message a person could act on.

export function asObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

export function reqString(o: Record<string, unknown>, key: string, max = 4000): string | null {
  const v = o[key];
  if (typeof v !== "string" || !v.trim()) return null;
  return v.trim().slice(0, max);
}

export function optString(o: Record<string, unknown>, key: string, max = 4000): string | null {
  const v = o[key];
  if (typeof v !== "string" || !v.trim()) return null;
  return v.trim().slice(0, max);
}

export function strArray(o: Record<string, unknown>, key: string, allowed?: readonly string[]): string[] {
  const v = o[key];
  if (!Array.isArray(v)) return [];
  const out = v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim());
  return allowed ? out.filter((x) => allowed.includes(x)) : out;
}

export function intIn(o: Record<string, unknown>, key: string, lo: number, hi: number, dflt: number): number {
  const n = Number(o[key]);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(Math.max(Math.round(n), lo), hi);
}

export function oneOf<T extends string>(o: Record<string, unknown>, key: string, allowed: readonly T[]): T | null {
  const v = o[key];
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : null;
}
