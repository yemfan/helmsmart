import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { effectiveAutopilot } from "@/lib/realtyboss/autopilot";
import { logAssistantActivity } from "@/lib/realtyboss/activities";
import type { AssistantType } from "@/lib/realtyboss/team";
import type { BossChannel } from "@/lib/realtyboss/actions/registry";
import { getBossTool } from "./registry";
import type { BossTool, ToolContext, ToolOutcome } from "./types";

/**
 * Central Boss tool executor — the ONLY way the agent loop runs a tool.
 *
 * Hard rails enforced HERE, in code, not in prompts (HANDOFF_BOSS_V2 §1.4):
 *   - `financial` tools never run autonomously, period.
 *   - `outbound` tools in ask mode go through `propose()` — the send path is
 *     never invoked, so a prompt-injected or confused model cannot send.
 *   - Consent: contacts with do_not_contact_sms/email are never messaged, even
 *     in auto mode.
 *   - Max 1 outbound voice call per contact per run.
 *   - Per-run tool-call budget.
 *   - Idempotency: (runId, stepIndex) — a retried step returns the recorded
 *     outcome instead of double-sending.
 *   - Every execution appends an assistant_activities audit row.
 *
 * Quiet hours + per-contact daily caps are enforced by the send rails
 * themselves via the shared sendWindow helpers (drafts dispatcher defers,
 * scheduler tools compute open-window times) — see lib/agent-messaging/.
 */

export type IdempotencyStore = {
  get(key: string): Promise<ToolOutcome | null>;
  set(key: string, outcome: ToolOutcome): Promise<void>;
};

/** Default store: per-process. PR-3 swaps in a boss_run_steps-backed store. */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private map = new Map<string, ToolOutcome>();
  async get(key: string): Promise<ToolOutcome | null> {
    return this.map.get(key) ?? null;
  }
  async set(key: string, outcome: ToolOutcome): Promise<void> {
    this.map.set(key, outcome);
  }
}

export type ContactConsent = {
  doNotContactSms: boolean;
  doNotContactEmail: boolean;
};

/** Injectable seams — tests swap these; production uses the defaults. */
export type ExecuteDeps = {
  resolveAutopilot: (
    agentId: string,
    assignee: Parameters<typeof effectiveAutopilot>[1],
    channel: BossChannel,
  ) => Promise<boolean>;
  getContactConsent: (contactId: string) => Promise<ContactConsent | null>;
  logActivity: (input: {
    agentId: string;
    assistantType: AssistantType;
    activityType: string;
    summary: string;
    outcome?: string | null;
    requiresAttention?: boolean;
  }) => Promise<void>;
  idempotency: IdempotencyStore;
  /** Test seam — production always resolves from the real registry. */
  getTool?: (name: string) => BossTool<unknown> | null;
};

async function defaultGetContactConsent(contactId: string): Promise<ContactConsent | null> {
  const { data } = await supabaseAdmin
    .from("contacts")
    .select("do_not_contact_sms, do_not_contact_email")
    .eq("id", contactId)
    .maybeSingle();
  if (!data) return null;
  const row = data as { do_not_contact_sms?: boolean | null; do_not_contact_email?: boolean | null };
  return {
    doNotContactSms: !!row.do_not_contact_sms,
    doNotContactEmail: !!row.do_not_contact_email,
  };
}

const sharedInMemoryStore = new InMemoryIdempotencyStore();

export function defaultExecuteDeps(): ExecuteDeps {
  return {
    resolveAutopilot: effectiveAutopilot,
    getContactConsent: defaultGetContactConsent,
    logActivity: logAssistantActivity,
    idempotency: sharedInMemoryStore,
  };
}

export async function executeTool(
  ctx: ToolContext,
  toolName: string,
  rawInput: unknown,
  deps: ExecuteDeps = defaultExecuteDeps(),
): Promise<ToolOutcome> {
  const tool = (deps.getTool ?? getBossTool)(toolName);
  if (!tool) return { status: "failed", error: `Unknown tool: ${toolName}` };

  // Budget — counted per attempt, before any work.
  if (ctx.runState.toolCalls >= ctx.runState.maxToolCalls) {
    return {
      status: "rejected",
      reason: `Tool-call budget exhausted (${ctx.runState.maxToolCalls} per run).`,
    };
  }
  ctx.runState.toolCalls += 1;

  const parsed = tool.inputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      status: "failed",
      error: `Invalid input for ${tool.name}: ${parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ")}`,
    };
  }
  const input = parsed.data;

  // Idempotency — a retried step must not re-run side effects.
  const idemKey = `${ctx.runId}:${ctx.stepIndex}`;
  const prior = await deps.idempotency.get(idemKey);
  if (prior) return prior;

  const outcome = await gateAndRun(ctx, tool, input, deps);

  await deps.idempotency.set(idemKey, outcome);
  await audit(ctx, tool, outcome, deps);
  return outcome;
}

async function gateAndRun(
  ctx: ToolContext,
  tool: BossTool<unknown>,
  input: unknown,
  deps: ExecuteDeps,
): Promise<ToolOutcome> {
  try {
    // Hard rail: financial actions are never autonomous (HANDOFF §1.4).
    if (tool.riskClass === "financial") {
      return {
        status: "rejected",
        reason: "Financial actions are never executed autonomously. Ask the Realtor to do this.",
      };
    }

    if (tool.riskClass !== "outbound") {
      return await tool.execute(ctx, input);
    }

    // ── outbound gating ──────────────────────────────────────────────
    if (!tool.outbound) {
      return { status: "failed", error: `${tool.name} is outbound but declares no outbound spec.` };
    }
    const channel = tool.outbound.channel(input);
    const contactId = tool.outbound.contactId?.(input) ?? null;

    // Consent first — applies to ask AND auto: we don't even draft proposals
    // for contacts who opted out.
    if (contactId) {
      const consent = await deps.getContactConsent(contactId);
      if (consent) {
        if (channel === "sms" && consent.doNotContactSms) {
          return { status: "rejected", reason: "Contact has opted out of SMS (do-not-contact)." };
        }
        if (channel === "email" && consent.doNotContactEmail) {
          return { status: "rejected", reason: "Contact has opted out of email (do-not-contact)." };
        }
      }
    }

    // Overnight rails (HANDOFF §PR-5): zero voice calls; everything else
    // outbound lands as a draft/proposal for the morning — never a send.
    if (ctx.overnight) {
      if (channel === "call") {
        return { status: "rejected", reason: "Overnight runs never place voice calls." };
      }
      if (tool.propose) return await tool.propose(ctx, input);
      return {
        status: "pending_approval",
        summary: `${tool.name} queued for morning approval (overnight run).`,
        proposal: { tool: tool.name, input },
      };
    }

    // Max 1 outbound voice call per contact per run — even in auto mode.
    if (channel === "call" && contactId) {
      if (ctx.runState.voiceCallContacts.has(contactId)) {
        return {
          status: "rejected",
          reason: "Already placed/queued one voice call to this contact in this run.",
        };
      }
    }

    const auto =
      ctx.approvedByRealtor === true
        ? true // explicit human approval of this step
        : await deps.resolveAutopilot(ctx.agentId, tool.assignee, channel);

    if (!auto) {
      // Ask mode: the send path is unreachable by construction.
      if (tool.propose) return await tool.propose(ctx, input);
      return {
        status: "pending_approval",
        summary: `${tool.name} requires approval (autopilot is set to ask for ${tool.assignee}/${channel}).`,
        proposal: { tool: tool.name, input },
      };
    }

    const outcome = await tool.execute(ctx, input);
    if (channel === "call" && contactId && outcome.status === "completed") {
      ctx.runState.voiceCallContacts.add(contactId);
    }
    return outcome;
  } catch (e) {
    return { status: "failed", error: e instanceof Error ? e.message : "Tool execution failed." };
  }
}

const ASSIGNEE_TO_ASSISTANT: Record<string, AssistantType> = {
  receptionist: "receptionist",
  sales_assistant: "sales_assistant",
  marketing_assistant: "marketing_assistant",
  transaction_assistant: "transaction_assistant",
  accountant: "accountant",
};

async function audit(
  ctx: ToolContext,
  tool: BossTool<unknown>,
  outcome: ToolOutcome,
  deps: ExecuteDeps,
): Promise<void> {
  try {
    const summary =
      outcome.status === "completed" || outcome.status === "pending_approval"
        ? outcome.summary
        : outcome.status === "rejected"
          ? outcome.reason
          : outcome.error;
    await deps.logActivity({
      agentId: ctx.agentId,
      assistantType: ASSIGNEE_TO_ASSISTANT[tool.assignee] ?? "boss_assistant",
      activityType: `boss_tool_${outcome.status}`,
      summary: `[${tool.name}] ${summary}`.slice(0, 500),
      outcome: outcome.status,
      requiresAttention: outcome.status === "pending_approval",
    });
  } catch {
    // Audit logging is fire-and-forget — never fail the tool on it.
  }
}
