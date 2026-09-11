/**
 * Mark's tool loop: ask the model, run the tools it calls through
 * `runAction`, feed the results back, repeat — until it answers in text, or
 * the round limit or the token budget says stop.
 *
 * Pure: the model and the dispatcher are handed in, so the tests drive it
 * with a scripted model and the eval harness with synthetic tools.
 *
 * Prompt caching (see `lib/promptCache.ts`). Each round re-sends the tool
 * definitions, the system prompt and the whole transcript. Two breakpoints:
 * the system prompt (which covers the tools — the cached prefix runs tools →
 * system → messages) and the END of the transcript, MOVED forward each round,
 * never added, so a long loop never passes the API's limit of four. Every
 * message is sent as a block array — a bare-string message has nothing to
 * attach a breakpoint to, silently.
 *
 * The budget counts the whole context of every call — uncached input plus
 * cache reads plus cache writes (`totalContextTokens`). With caching on,
 * `input_tokens` alone is only the uncached remainder, and a guard spent on it
 * would let a loop run several times longer than its budget.
 */
import { cachedSystem, markTranscriptCached, totalContextTokens, type CacheableTextBlock, type LooseMessage } from "@/lib/promptCache";
import { outcomeForModel, type RunOutcome } from "./run-action";

/**
 * The model Mark thinks with when he has tools. A string, so the SDK accepts
 * any id; `claude-haiku-4-5` answered the tool-less panel before this.
 */
export const MARK_AGENT_MODEL = "claude-sonnet-5";

/** Model calls per request. A request that needs more than this should be two requests. */
export const MARK_MAX_ROUNDS = 6;

/** Total context tokens (cached or not) plus output, across every round of one request. */
export const MARK_TOKEN_BUDGET = 200_000;

export const MARK_MAX_TOKENS = 8_000;

export type ToolDef = { name: string; description: string; input_schema: Record<string, unknown> };

export type ModelToolUse = { id: string; name: string; input: unknown };

export type ModelTurn = {
  /** Raw assistant content blocks, appended to the transcript verbatim (thinking blocks included). */
  content: Record<string, unknown>[];
  text: string;
  toolUses: ModelToolUse[];
  stopReason: string | null;
  usage: unknown;
};

export interface MarkModel {
  turn(
    args: { system: CacheableTextBlock[]; tools: ToolDef[]; messages: LooseMessage[]; maxTokens: number },
    onText: (delta: string) => void,
  ): Promise<ModelTurn>;
}

export type LoopEvent =
  | { type: "text"; text: string }
  | { type: "proposal"; outcome: Extract<RunOutcome, { status: "proposed" }> };

export type LoopStop = "done" | "round_limit" | "budget" | "refusal";

export interface LoopResult {
  text: string;
  rounds: number;
  stop: LoopStop;
  /** Context tokens across all rounds, cached reads and writes included. */
  contextTokens: number;
  outputTokens: number;
  toolCalls: Array<{ name: string; input: unknown; outcome: RunOutcome }>;
}

export interface LoopOptions {
  model: MarkModel;
  system: string;
  tools: ToolDef[];
  history: Array<{ role: "user" | "assistant"; content: string }>;
  dispatch: (name: string, input: unknown) => Promise<RunOutcome>;
  emit: (event: LoopEvent) => void;
  /** Already in the owner's language. */
  copy: { roundLimit: string; budget: string; refusal: string };
  maxRounds?: number;
  tokenBudget?: number;
  maxTokens?: number;
}

function outputTokensOf(usage: unknown): number {
  const v = (usage as { output_tokens?: unknown } | null)?.output_tokens;
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export async function runMarkLoop(opts: LoopOptions): Promise<LoopResult> {
  const maxRounds = opts.maxRounds ?? MARK_MAX_ROUNDS;
  const budget = opts.tokenBudget ?? MARK_TOKEN_BUDGET;
  const system = cachedSystem(opts.system);

  // Blocks, not strings, so the transcript breakpoint always has somewhere to go.
  const messages: LooseMessage[] = opts.history.map((m) => ({
    role: m.role,
    content: [{ type: "text", text: m.content }],
  }));

  let text = "";
  let contextTokens = 0;
  let outputTokens = 0;
  const toolCalls: LoopResult["toolCalls"] = [];

  const say = (s: string) => {
    if (!s) return;
    text += s;
    opts.emit({ type: "text", text: s });
  };
  const finish = (stop: LoopStop, rounds: number, note?: string): LoopResult => {
    if (note) say(`${text.trim() ? "\n\n" : ""}${note}`);
    return { text, rounds, stop, contextTokens, outputTokens, toolCalls };
  };

  for (let round = 1; round <= maxRounds; round += 1) {
    if (contextTokens + outputTokens >= budget) return finish("budget", round - 1, opts.copy.budget);

    markTranscriptCached(messages);
    let first = true;
    const turn = await opts.model.turn(
      { system, tools: opts.tools, messages, maxTokens: opts.maxTokens ?? MARK_MAX_TOKENS },
      (delta) => {
        // Text from a new round starts a new paragraph, not the middle of the last one.
        if (first && delta && text.trim() && !text.endsWith("\n")) say("\n\n");
        first = false;
        say(delta);
      },
    );
    contextTokens += totalContextTokens(turn.usage);
    outputTokens += outputTokensOf(turn.usage);
    messages.push({ role: "assistant", content: turn.content });

    if (turn.stopReason === "refusal") return finish("refusal", round, text.trim() ? undefined : opts.copy.refusal);
    if (turn.toolUses.length === 0) return finish("done", round);
    if (round === maxRounds) return finish("round_limit", round, opts.copy.roundLimit);

    // Every tool_use gets its tool_result, all in ONE user message.
    const results: Record<string, unknown>[] = [];
    for (const use of turn.toolUses) {
      const outcome = await opts.dispatch(use.name, use.input);
      toolCalls.push({ name: use.name, input: use.input, outcome });
      if (outcome.status === "proposed") opts.emit({ type: "proposal", outcome });
      results.push({
        type: "tool_result",
        tool_use_id: use.id,
        content: outcomeForModel(outcome),
        ...(outcome.status === "failed" ? { is_error: true } : {}),
      });
    }
    messages.push({ role: "user", content: results });
  }
  return finish("round_limit", maxRounds, opts.copy.roundLimit);
}
