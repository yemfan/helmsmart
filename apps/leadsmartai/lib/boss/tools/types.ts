import type { z } from "zod";
import type { BossAssignee, BossChannel } from "@/lib/realtyboss/actions/registry";

/**
 * Boss v2 tool layer (HANDOFF_BOSS_V2 PR-2).
 *
 * A BossTool wraps ONE existing capability (CMA, drafts, scheduler, …) behind a
 * typed contract the agent loop can call. Tools never enforce policy themselves
 * beyond what their underlying rail already does — the central executor
 * (./execute.ts) owns the safety rails: autopilot resolution, ask-mode
 * never-send, consent, per-run voice cap, budgets, idempotency, audit logging.
 */

export type RiskClass = "research" | "draft" | "crm_write" | "outbound" | "financial";

/** Per-run budget + rails state. One instance per boss run, shared across steps. */
export type ToolRunState = {
  toolCalls: number;
  maxToolCalls: number;
  /** Contacts already targeted by an outbound voice call this run (max 1 each). */
  voiceCallContacts: Set<string>;
};

export const DEFAULT_MAX_TOOL_CALLS = 25;

export function newRunState(maxToolCalls: number = DEFAULT_MAX_TOOL_CALLS): ToolRunState {
  return { toolCalls: 0, maxToolCalls, voiceCallContacts: new Set() };
}

export type ToolContext = {
  agentId: string;
  /** The boss run this execution belongs to — idempotency key half 1. */
  runId: string;
  /** Position within the run — idempotency key half 2. */
  stepIndex: number;
  /** Assistant acting on the agent's behalf — resolves the autopilot matrix. */
  assignee: BossAssignee;
  runState: ToolRunState;
  /** Injectable clock (tests). Defaults to `new Date()` at execution time. */
  now?: Date;
  /**
   * Set ONLY by the approval decision path after the realtor explicitly
   * approved this exact step: outbound executes without re-consulting
   * autopilot. Consent, voice caps, and send-rail guards still apply.
   */
  approvedByRealtor?: boolean;
  /**
   * Overnight runs (HANDOFF PR-5): voice calls are rejected outright and
   * every other outbound tool is forced to propose() regardless of the
   * autopilot matrix — mornings show drafts, never surprise sends.
   */
  overnight?: boolean;
};

export type ToolOutcome =
  | {
      status: "completed";
      summary: string;
      /** Dashboard link to the produced artifact, when one exists. */
      artifactUrl?: string | null;
      /** Structured result handed back to the model on the next loop turn. */
      data?: unknown;
    }
  | {
      status: "pending_approval";
      summary: string;
      /** What was prepared (draft id, proposed action) — surfaced for approval. */
      proposal?: unknown;
    }
  | { status: "rejected"; reason: string }
  | { status: "failed"; error: string };

/** Declared by outbound tools so the executor can gate them centrally. */
export type OutboundSpec<I> = {
  /** Channel this input sends on — resolves the per-channel autopilot cell. */
  channel: (input: I) => BossChannel;
  /** Contact the send targets, when known — consent is checked against it. */
  contactId?: (input: I) => string | null;
};

export type BossTool<I = unknown> = {
  name: string;
  /** Shown to the model in the tool catalog — say what it does + when to use it. */
  description: string;
  inputSchema: z.ZodType<I>;
  riskClass: RiskClass;
  /** Assistant this tool belongs to — autopilot lookups run against it. */
  assignee: BossAssignee;
  /** Required when riskClass is "outbound". */
  outbound?: OutboundSpec<I>;
  /**
   * The autonomous action. For outbound tools the executor calls this ONLY in
   * auto mode — ask mode goes through `propose` and can never send.
   */
  execute: (ctx: ToolContext, input: I) => Promise<ToolOutcome>;
  /**
   * Ask-mode path for outbound tools: park a durable proposal (a draft row, a
   * queued task), send nothing. Executor falls back to a generic
   * pending_approval outcome when a tool doesn't implement it.
   */
  propose?: (ctx: ToolContext, input: I) => Promise<ToolOutcome>;
};

/** Type helper so tool modules keep full input inference from their zod schema. */
export function defineTool<S extends z.ZodType>(
  tool: Omit<BossTool<z.infer<S>>, "inputSchema"> & { inputSchema: S },
): BossTool<z.infer<S>> {
  return tool;
}
