import "server-only";
import { getWorkforceTool } from "./tools/registry";
import type { ToolContext, ToolOutcome, WorkforceTool } from "./tools/types";

/**
 * The central tool executor — the one place the safety rails live.
 *
 * Tools describe what they do; this decides whether they may. Keeping the rails
 * here rather than inside each tool means a new tool cannot forget one, and the
 * rules can be read in a single file:
 *
 *   1. Unknown tool            → rejected, never a crash.
 *   2. Bad input               → rejected with a message a person could act on.
 *   3. Tool-call budget spent  → rejected.
 *   4. Credit ceiling exceeded → rejected BEFORE any money is spent.
 *   5. publish-class tools     → propose() unless the owner approved this step.
 *   6. Anything thrown         → a failed outcome, never an unhandled rejection.
 */

export type ExecuteDeps = {
  /** Tool resolution, injectable so an eval harness can supply synthetic tools. */
  getTool?: (name: string) => WorkforceTool<unknown> | null;
};

export async function executeTool(
  ctx: ToolContext,
  name: string,
  rawInput: unknown,
  deps: ExecuteDeps = {},
): Promise<ToolOutcome> {
  const tool = (deps.getTool ?? getWorkforceTool)(name);
  if (!tool) {
    return { status: "rejected", reason: `There is no tool called "${name}". Use one from the catalog.` };
  }

  // (3) Budget first — cheapest check, and it must hold even for free tools so
  // a loop cannot spin forever on research calls.
  if (ctx.runState.toolCalls > ctx.runState.maxToolCalls) {
    return { status: "rejected", reason: `Step budget (${ctx.runState.maxToolCalls} tool calls) is used up. Wrap up and report what you have.` };
  }

  // (2) Validate. The model can send anything; the message goes back to it AND
  // is what the owner would read in the activity feed, so it has to be plain.
  const parsed = tool.parseInput(rawInput);
  if (!parsed.ok) return { status: "rejected", reason: parsed.error };
  const input = parsed.value;

  // (4) Credit ceiling — enforced before the tool runs, because a tool that
  // discovers it is over budget mid-render has already spent the credits.
  if (tool.riskClass === "generate" && ctx.runState.maxCredits !== null) {
    const estimate = tool.estimateCredits?.(input) ?? 0;
    if (ctx.runState.creditsSpent + estimate > ctx.runState.maxCredits) {
      const left = Math.max(0, ctx.runState.maxCredits - ctx.runState.creditsSpent);
      return {
        status: "rejected",
        reason:
          `That would cost ${estimate} credits and only ${left} remain in this mission's budget. ` +
          `Choose a cheaper format, or ask the owner to raise the budget.`,
      };
    }
  }

  // (5) Publishing is gated on an explicit human decision, structurally — not on
  // the model deciding it feels confident. propose() parks something durable and
  // sends nothing; the approval path re-runs this step with approvedByOwner set.
  if (tool.riskClass === "publish" && !ctx.approvedByOwner) {
    if (tool.propose) {
      try {
        return await tool.propose(ctx, input);
      } catch (e) {
        return failure(e, `I prepared the post but couldn't queue it for your approval.`);
      }
    }
    return {
      status: "pending_approval",
      summary: `${tool.name} is ready to run and needs your approval.`,
      proposal: input,
    };
  }

  // (6) Run it.
  try {
    return await tool.execute(ctx, input);
  } catch (e) {
    return failure(e, `The "${tool.name}" step didn't complete.`);
  }
}

/** Last-resort conversion. Tools handle their own errors; this catches what escapes. */
function failure(e: unknown, fallback: string): ToolOutcome {
  const raw = e instanceof Error ? e.message : "";
  const usable = raw && raw.length < 160 && !raw.includes("\n");
  return { status: "failed", error: usable ? `${fallback} (${raw})` : fallback, retryable: true };
}
