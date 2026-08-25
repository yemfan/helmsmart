import "server-only";
import { listWorkforceTools, toolsForModel } from "./tools/registry";
import { executeTool, type ExecuteDeps } from "./execute";
import { newRunState, type ToolContext, type ToolOutcome, type WorkforceTool } from "./tools/types";
import type { AgentRunRow, RunStore } from "./store";
import type { ModelClient } from "./model";
import { VERIFY_PROMPT } from "./prompt";
import type { WorkerId } from "./workers";

/**
 * Nina's agent loop: plan → call tools → verify → report.
 *
 * One `driveRun` call advances a run until it is terminal, parked for approval,
 * or close to this invocation's soft deadline — at which point it persists and
 * asks the caller to re-kick. ALL state lives in agent_runs / agent_run_steps,
 * so a fresh invocation resumes from nothing but the run id. That is what makes
 * a multi-minute mission survivable on a 300-second function ceiling.
 *
 * Shape follows CloseBoss's Boss v2 engine, which has been running this pattern
 * in production; the differences are MarketingBoss's (credits instead of
 * consent rails, its own tool contract, no zod).
 */

export type EngineDeps = {
  store: RunStore;
  model: ModelClient;
  buildSystemPrompt(run: AgentRunRow): Promise<string>;
  executeDeps?: ExecuteDeps;
  /** Tool-set override for evals: real model, synthetic executors. */
  getTools?: () => WorkforceTool<unknown>[];
  /** Soft per-invocation deadline; the loop yields when it gets this close. */
  softDeadlineMs?: number;
  now?: () => number;
};

export type DriveResult = {
  status: AgentRunRow["status"];
  /** True when the invocation stopped on its deadline and needs another kick. */
  needsContinuation: boolean;
};

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
  if (messages.length === 0) messages.push({ role: "user", content: run.objective });

  const toolSet = deps.getTools?.() ?? listWorkforceTools();
  const tools = toolsForModel(toolSet);
  const system = await deps.buildSystemPrompt(run);

  let toolCalls = run.tool_calls;
  let inputTokens = run.input_tokens;
  let outputTokens = run.output_tokens;
  let verifyDone = run.verify_done;
  let planJson = run.plan_json;

  const runState = newRunState({ maxToolCalls: run.max_tool_calls, maxCredits: run.max_credits });
  runState.toolCalls = toolCalls;
  runState.creditsSpent = run.credits_spent;

  const persist = async (patch: Partial<AgentRunRow> = {}) => {
    await store.updateRun(runId, {
      messages_json: messages,
      tool_calls: toolCalls,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      credits_spent: runState.creditsSpent,
      verify_done: verifyDone,
      plan_json: planJson,
      ...patch,
    });
  };

  const finish = async (status: AgentRunRow["status"], fields: Partial<AgentRunRow> = {}): Promise<DriveResult> => {
    await persist({ status, finished_at: new Date().toISOString(), ...fields });
    return { status, needsContinuation: false };
  };

  await store.updateRun(runId, { status: "running" });

  for (;;) {
    if (now() >= softDeadline) {
      await persist({ status: "running" });
      return { status: "running", needsContinuation: true };
    }
    if (inputTokens + outputTokens >= run.token_budget) {
      return finish("budget_exceeded", {
        report: lastAssistantText(messages) ?? "I ran out of thinking budget before finishing this one.",
        error: "token_budget_exceeded",
      });
    }

    let response;
    try {
      response = await deps.model.createMessage({ system, messages, tools, maxTokens: 2000 });
    } catch (e) {
      // A model outage should not lose the work already done — keep the
      // transcript and report what got finished.
      const reason = e instanceof Error ? e.message : "the AI service was unreachable";
      return finish("failed", {
        error: reason,
        report: lastAssistantText(messages) ?? "I couldn't reach the AI service, so this mission didn't get anywhere. Please try again.",
      });
    }

    inputTokens += response.inputTokens;
    outputTokens += response.outputTokens;
    messages.push({ role: "assistant", content: response.rawContent });

    // The first substantive text is the plan the owner sees.
    if (!planJson && response.text.trim()) planJson = { plan: response.text.trim() };

    if (response.toolUses.length === 0) {
      if (!verifyDone) {
        verifyDone = true;
        messages.push({ role: "user", content: VERIFY_PROMPT });
        await persist();
        continue;
      }
      return finish("completed", {
        report: response.text.trim() || lastAssistantText(messages) || "Done.",
      });
    }

    let parked = false;
    const toolResults: unknown[] = [];

    for (const tu of response.toolUses) {
      let outcome: ToolOutcome;
      const tool = toolSet.find((t) => t.name === tu.name);

      // An earlier call this turn parked for approval. Other publish-class calls
      // may still run — they only ever propose, so nothing is sent and the owner
      // gets ONE batch of decisions instead of a trickle. Everything else waits:
      // a later step may assume the parked publish actually happened.
      const parkableAlongside = parked && tool?.riskClass === "publish";
      if (parked && !parkableAlongside) {
        outcome = {
          status: "rejected",
          reason: "Skipped: an earlier step is waiting on the owner's approval. Re-plan once they decide.",
        };
      } else if (toolCalls >= run.max_tool_calls) {
        outcome = { status: "rejected", reason: `Step budget (${run.max_tool_calls}) is used up.` };
      } else {
        const stepIndex = toolCalls;
        toolCalls += 1;
        runState.toolCalls = toolCalls;

        const worker: WorkerId = tool?.worker ?? "nina";
        const { step, alreadyExisted } = await store.claimStep({
          runId,
          userId: run.user_id,
          stepIndex,
          worker,
          toolName: tu.name,
          riskClass: tool?.riskClass ?? "unknown",
          input: tu.input,
        });

        if (alreadyExisted && step.output_json) {
          // Replayed invocation: reuse the recorded outcome rather than running
          // (and re-charging) the tool a second time.
          outcome = step.output_json;
        } else {
          const ctx: ToolContext = {
            userId: run.user_id,
            runId,
            stepIndex,
            missionId: run.mission_id,
            runState,
          };
          outcome = await executeTool(ctx, tu.name, tu.input, deps.executeDeps ?? {});
          await store.finishStep(runId, stepIndex, {
            output_json: outcome,
            summary: summaryOf(outcome),
            artifact_url: outcome.status === "completed" ? (outcome.artifactUrl ?? null) : null,
            credits_spent: outcome.status === "completed" ? (outcome.creditsSpent ?? 0) : 0,
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

        if (outcome.status === "pending_approval") parked = true;
      }

      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: JSON.stringify(outcome),
        is_error: outcome.status === "failed",
      });
    }

    messages.push({ role: "user", content: toolResults });

    if (parked) {
      await persist({ status: "awaiting_approval" });
      return { status: "awaiting_approval", needsContinuation: false };
    }
    await persist();
  }
}

/** One plain sentence for the activity feed, whatever the outcome was. */
function summaryOf(outcome: ToolOutcome): string {
  switch (outcome.status) {
    case "completed":
      return outcome.summary;
    case "pending_approval":
      return outcome.summary;
    case "rejected":
      return outcome.reason;
    case "failed":
      return outcome.error;
  }
}

function lastAssistantText(messages: unknown[]): string | null {
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
