import "server-only";

import { zodToJsonSchema } from "zod-to-json-schema";
import { markTranscriptCached } from "@leadsmart/shared/utils/promptCache";
import { personaFor } from "@/lib/closeboss/assigneePersona";
import { listBossTools } from "../tools/registry";
import {
  executeTool,
  defaultExecuteDeps,
  type ExecuteDeps,
  type IdempotencyStore,
} from "../tools/execute";
import { newRunState, type BossTool, type ToolContext, type ToolOutcome } from "../tools/types";
import type { BossRunRow, RunStore } from "./store";

/**
 * The Boss v2 agent loop: plan → call tools → verify → report
 * (HANDOFF_BOSS_V2 PR-3).
 *
 * One `driveRun` invocation advances a run until it is terminal, paused for
 * approval, or the invocation's soft deadline is near (Vercel maxDuration) —
 * then the caller re-kicks a fresh invocation. All state lives in boss_runs /
 * boss_run_steps, so any invocation can pick the run up from scratch.
 */

// ── model plumbing (injectable for tests) ────────────────────────────

export type ModelToolUse = { id: string; name: string; input: unknown };

export type ModelResponse = {
  /** Text blocks concatenated. */
  text: string;
  toolUses: ModelToolUse[];
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
  /** Raw assistant content blocks — appended verbatim to the transcript. */
  rawContent: unknown[];
};

export type ModelClient = {
  createMessage(args: {
    system: string;
    messages: unknown[];
    tools: Array<{ name: string; description: string; input_schema: unknown }>;
    maxTokens: number;
  }): Promise<ModelResponse>;
};

export type EngineDeps = {
  store: RunStore;
  model: ModelClient;
  buildSystemPrompt(run: BossRunRow): Promise<string>;
  executeDeps?: Omit<ExecuteDeps, "idempotency">;
  /**
   * Tool set override (eval harness): real model + real schemas, synthetic
   * executors. Production always uses the registry.
   */
  getTools?: () => BossTool<never>[];
  /** Soft per-invocation deadline; the loop yields when it's this close. */
  softDeadlineMs?: number;
  now?: () => number;
};

export type DriveResult = {
  status: BossRunRow["status"];
  /** True when the invocation stopped on the soft deadline and needs a re-kick. */
  needsContinuation: boolean;
};

const VERIFY_PROMPT =
  "Verification turn: re-read the original command and every tool result above. " +
  "If something is missing or failed and the budget allows, continue with tool calls now. " +
  "Otherwise reply with ONLY the final report the realtor reads — no preamble, no meta-commentary " +
  "about the command or verification. Lead with what was DONE (with links), then what is " +
  "DRAFTED/awaiting approval, then anything that NEEDS the realtor. Under 200 words, plain text.";

export function bossToolsForModel(
  toolSet: BossTool<never>[] = listBossTools() as unknown as BossTool<never>[],
): Array<{
  name: string;
  description: string;
  input_schema: unknown;
}> {
  return toolSet.map((t) => {
    const schema = zodToJsonSchema(t.inputSchema, { $refStrategy: "none" }) as Record<
      string,
      unknown
    >;
    delete schema.$schema;
    // Who owns this tool, stated in the description the model reads. Max is
    // told to speak as a manager delegating to a named team, but nothing used
    // to tell him WHICH team owned which tool — so he guessed, and announced
    // "I'll have the Transaction team set up the open house" over a step the
    // UI then stamped "Ruby · Marketing Assistant" from this same assignee.
    const persona = personaFor(t.assignee);
    const description = persona
      ? `${t.description} [Owned by ${persona.name}, the ${persona.team} team.]`
      : t.description;
    return { name: t.name, description, input_schema: schema };
  });
}

/** Advance a run as far as this invocation safely can. */
export async function driveRun(runId: string, deps: EngineDeps): Promise<DriveResult> {
  const now = deps.now ?? Date.now;
  const softDeadline = now() + (deps.softDeadlineMs ?? 220_000);
  const store = deps.store;

  const run = await store.loadRun(runId);
  if (!run) return { status: "failed", needsContinuation: false };
  if (
    run.status === "completed" ||
    run.status === "failed" ||
    run.status === "cancelled" ||
    run.status === "budget_exceeded" ||
    run.status === "awaiting_approval"
  ) {
    return { status: run.status, needsContinuation: false };
  }

  const messages: unknown[] = [...run.messages_json];
  if (messages.length === 0) {
    messages.push({ role: "user", content: run.objective });
  }

  const toolSet = (deps.getTools?.() ?? listBossTools()) as BossTool<never>[];
  const tools = bossToolsForModel(toolSet);
  const system = await deps.buildSystemPrompt(run);
  let toolCalls = run.tool_calls;
  let inputTokens = run.input_tokens;
  let outputTokens = run.output_tokens;
  let verifyDone = run.verify_done;
  let planJson = run.plan_json;

  const runState = newRunState(run.max_tool_calls);
  runState.toolCalls = toolCalls;

  const persist = async (patch: Partial<BossRunRow> = {}) => {
    await store.updateRun(runId, {
      messages_json: messages,
      tool_calls: toolCalls,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      verify_done: verifyDone,
      plan_json: planJson,
      ...patch,
    });
  };

  const finish = async (
    status: BossRunRow["status"],
    fields: Partial<BossRunRow> = {},
  ): Promise<DriveResult> => {
    await persist({ status, finished_at: new Date().toISOString(), ...fields });
    return { status, needsContinuation: false };
  };

  await store.updateRun(runId, { status: "running" });

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (now() >= softDeadline) {
      await persist({ status: "running" });
      return { status: "running", needsContinuation: true };
    }
    if (inputTokens + outputTokens >= run.token_budget) {
      return finish("budget_exceeded", {
        report: reportFromMessages(messages) ?? "Token budget exhausted before completion.",
        error: "token_budget_exceeded",
      });
    }

    let response: ModelResponse;
    try {
      // Move the transcript breakpoint to the end of what has been said so far,
      // so this round reads every previous round from cache. It has to MOVE
      // rather than accumulate — the API allows four breakpoints, and a loop
      // that leaves one behind per tool call exhausts them almost immediately.
      //
      // Together with the system/tools breakpoint in the real model client this
      // is where the saving lives: a question answered in five tool round-trips
      // used to re-send the whole conversation five times at full price.
      markTranscriptCached(messages as never);
      response = await deps.model.createMessage({
        system,
        messages,
        tools,
        maxTokens: 2000,
      });
    } catch (e) {
      return finish("failed", { error: e instanceof Error ? e.message : "model_error" });
    }
    inputTokens += response.inputTokens;
    outputTokens += response.outputTokens;

    messages.push({ role: "assistant", content: response.rawContent });

    // First planning text becomes the stored plan.
    if (!planJson && response.text.trim()) {
      planJson = { plan: response.text.trim() };
    }

    if (response.toolUses.length === 0) {
      if (!verifyDone) {
        verifyDone = true;
        // Sent as a block rather than a bare string so the transcript
        // breakpoint has something to attach to. The verify round carries the
        // ENTIRE conversation and is the single most expensive call in a run;
        // with a string here `markTranscriptCached` finds no block on the last
        // message, places nothing, and that one call pays full price for the
        // whole transcript.
        messages.push({ role: "user", content: [{ type: "text", text: VERIFY_PROMPT }] });
        await persist();
        continue;
      }
      return finish("completed", {
        report: response.text.trim() || reportFromMessages(messages) || "Run completed.",
      });
    }

    // Execute tool calls in order; every tool_use gets a tool_result.
    let pausedForApproval = false;
    const toolResults: unknown[] = [];
    for (const tu of response.toolUses) {
      let outcome: ToolOutcome;
      // An earlier step in THIS turn parked for approval. Outbound tools can
      // still run — they only ever propose, so nothing is sent and the realtor
      // gets one batch of decisions instead of a trickle. Everything else waits:
      // a CRM write or a report may assume the parked send actually happened.
      const parkableAlongside =
        pausedForApproval && toolSet.find((t) => t.name === tu.name)?.riskClass === "outbound";
      if (pausedForApproval && !parkableAlongside) {
        outcome = {
          status: "rejected",
          reason: "Skipped: the run paused for approval of an earlier step. Re-plan after the decision.",
        };
      } else if (toolCalls >= run.max_tool_calls) {
        outcome = {
          status: "rejected",
          reason: `Tool budget (${run.max_tool_calls}) exhausted.`,
        };
      } else {
        const stepIndex = toolCalls;
        toolCalls += 1;
        const tool = toolSet.find((t) => t.name === tu.name);
        const { step, alreadyExisted } = await store.claimStep({
          runId,
          stepIndex,
          toolName: tu.name,
          riskClass: tool?.riskClass ?? "unknown",
          input: tu.input,
        });
        if (alreadyExisted && step.output_json) {
          outcome = step.output_json;
        } else {
          const ctx: ToolContext = {
            agentId: run.agent_id,
            runId,
            stepIndex,
            assignee: tool?.assignee ?? "sales_assistant",
            runState,
            overnight: run.trigger === "overnight",
          };
          const execDeps: ExecuteDeps = {
            ...(deps.executeDeps ?? defaultExecuteDeps()),
            idempotency: noopIdempotency, // durability lives in boss_run_steps
            // Resolve from the same tool set the model was offered, so an
            // injected eval/test tool set stays coherent end to end.
            getTool: (name) =>
              (toolSet.find((t) => t.name === name) as never) ?? null,
          };
          outcome = await executeTool(ctx, tu.name, tu.input, execDeps);
          await store.finishStep(runId, stepIndex, {
            output_json: outcome,
            status:
              outcome.status === "pending_approval"
                ? "pending_approval"
                : outcome.status === "completed"
                  ? "completed"
                  : outcome.status === "rejected"
                    ? "rejected"
                    : "failed",
            approval_state: outcome.status === "pending_approval" ? "pending" : "n/a",
            error: outcome.status === "failed" ? outcome.error : null,
          });
        }
        // Command runs pause at the first parked step so the realtor decides
        // in-flow. Overnight runs keep going — they collect drafts and finish
        // with the morning brief; approvals happen from the inbox after.
        if (outcome.status === "pending_approval" && run.trigger !== "overnight") {
          pausedForApproval = true;
        }
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: JSON.stringify(outcome),
        is_error: outcome.status === "failed",
      });
    }
    messages.push({ role: "user", content: toolResults });

    if (pausedForApproval) {
      await persist({ status: "awaiting_approval" });
      return { status: "awaiting_approval", needsContinuation: false };
    }
    await persist();
  }
}

const noopIdempotency: IdempotencyStore = {
  async get() {
    return null;
  },
  async set() {
    /* boss_run_steps is the durable record */
  },
};

function reportFromMessages(messages: unknown[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as { role?: string; content?: unknown };
    if (m.role !== "assistant") continue;
    if (typeof m.content === "string" && m.content.trim()) return m.content.trim();
    if (Array.isArray(m.content)) {
      const text = m.content
        .filter((b: { type?: string }) => b?.type === "text")
        .map((b: { text?: string }) => b.text ?? "")
        .join("\n")
        .trim();
      if (text) return text;
    }
  }
  return null;
}
