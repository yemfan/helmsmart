/**
 * Mark's loop with a scripted model: it dispatches what the model calls, stops
 * at the round limit, moves the cache breakpoint rather than piling them up,
 * and spends its budget on the whole context — cached reads included.
 */
import { describe, expect, it, vi } from "vitest";
import { MARK_AGENT_MODEL, runMarkLoop, type LoopEvent, type MarkModel, type ModelToolUse, type ModelTurn } from "../mark-loop";
import type { RunOutcome } from "../run-action";
import type { ApprovalRow } from "../approval-view";

type Block = Record<string, unknown>;
type Msg = { role: string; content: string | Block[] };
type Step = { text?: string; toolUses?: ModelToolUse[]; stopReason?: string; usage?: Record<string, number> };

function scripted(steps: Step[]) {
  const seen: Array<{ messages: Msg[]; system: Block[]; tools: unknown[] }> = [];
  let i = 0;
  const model: MarkModel = {
    async turn(args, onText) {
      seen.push({
        messages: JSON.parse(JSON.stringify(args.messages)) as Msg[],
        system: JSON.parse(JSON.stringify(args.system)) as Block[],
        tools: args.tools,
      });
      const s = steps[Math.min(i, steps.length - 1)];
      i += 1;
      if (s.text) onText(s.text);
      const toolUses = s.toolUses ?? [];
      const turn: ModelTurn = {
        content: [
          ...(s.text ? [{ type: "text", text: s.text }] : []),
          ...toolUses.map((u) => ({ type: "tool_use", id: u.id, name: u.name, input: u.input })),
        ],
        text: s.text ?? "",
        toolUses,
        stopReason: s.stopReason ?? (toolUses.length ? "tool_use" : "end_turn"),
        usage: s.usage ?? { input_tokens: 100, output_tokens: 20 },
      };
      return turn;
    },
  };
  return { model, seen, calls: () => i };
}

const copy = { roundLimit: "ROUND_LIMIT", budget: "BUDGET", refusal: "REFUSAL" };
const history = [{ role: "user" as const, content: "What's overdue?" }];
const completed: RunOutcome = { status: "completed", summary: "2 overdue invoices.", data: { invoices: [] } };
const use = (id: string, name = "list_overdue_invoices", input: unknown = {}): ModelToolUse => ({ id, name, input });

function breakpoints(messages: Msg[]): number {
  let n = 0;
  for (const m of messages) {
    if (!Array.isArray(m.content)) continue;
    for (const b of m.content) if (b && typeof b === "object" && "cache_control" in b) n += 1;
  }
  return n;
}

async function run(steps: Step[], opts: { dispatch?: (name: string, input: unknown) => Promise<RunOutcome>; tokenBudget?: number } = {}) {
  const s = scripted(steps);
  const events: LoopEvent[] = [];
  const dispatch = vi.fn(opts.dispatch ?? (async () => completed));
  const result = await runMarkLoop({
    model: s.model,
    system: "You are Mark.",
    tools: [{ name: "list_overdue_invoices", description: "x", input_schema: { type: "object", properties: {} } }],
    history,
    dispatch,
    emit: (e) => events.push(e),
    copy,
    tokenBudget: opts.tokenBudget,
  });
  return { ...s, result, events, dispatch };
}

describe("Mark's tool loop", () => {
  it("thinks with Sonnet 5 by default", () => {
    expect(MARK_AGENT_MODEL).toBe("claude-sonnet-5");
  });

  it("runs the tools the model calls and hands the results back", async () => {
    const { result, dispatch, seen } = await run([
      { text: "Let me have Alex check.", toolUses: [use("t1")] },
      { text: "Two invoices are overdue." },
    ]);
    expect(dispatch).toHaveBeenCalledWith("list_overdue_invoices", {});
    expect(result.stop).toBe("done");
    expect(result.rounds).toBe(2);
    const last = seen[1].messages[seen[1].messages.length - 1];
    expect(last.role).toBe("user");
    expect(last.content).toEqual([
      expect.objectContaining({ type: "tool_result", tool_use_id: "t1", content: expect.stringContaining('"status":"completed"') }),
    ]);
    // A new round's words start a new paragraph.
    expect(result.text).toBe("Let me have Alex check.\n\nTwo invoices are overdue.");
  });

  it("answers every tool call of a turn in ONE user message", async () => {
    const { seen } = await run([{ toolUses: [use("a"), use("b")] }, { text: "Done." }]);
    const last = seen[1].messages[seen[1].messages.length - 1];
    expect(Array.isArray(last.content) && last.content.map((b) => b.tool_use_id)).toEqual(["a", "b"]);
  });

  it("emits a proposal the moment one is parked", async () => {
    const approval = { id: "ap-1", action_key: "text_client" } as unknown as ApprovalRow;
    const { events } = await run([{ toolUses: [use("t1", "text_client", { client_id: "c", message: "hi" })] }, { text: "Waiting on you." }], {
      dispatch: async () => ({ status: "proposed", summary: "Sarah will text Priya", approval }),
    });
    expect(events.filter((e) => e.type === "proposal")).toEqual([
      { type: "proposal", outcome: { status: "proposed", summary: "Sarah will text Priya", approval } },
    ]);
  });

  it("stops at the round limit without running the last round's tools", async () => {
    const { result, dispatch, calls } = await run([{ toolUses: [use("again")] }]);
    expect(calls()).toBe(6);
    expect(dispatch).toHaveBeenCalledTimes(5);
    expect(result.stop).toBe("round_limit");
    expect(result.text).toContain("ROUND_LIMIT");
  });

  it("says so plainly when the model declines", async () => {
    const { result } = await run([{ stopReason: "refusal" }]);
    expect(result.stop).toBe("refusal");
    expect(result.text).toBe("REFUSAL");
  });
});

describe("prompt caching", () => {
  const steps: Step[] = [{ toolUses: [use("t1")] }, { toolUses: [use("t2")] }, { toolUses: [use("t3")] }, { text: "Done." }];

  it("caches the system prompt as a block", async () => {
    const { seen } = await run(steps);
    expect(seen[0].system).toEqual([{ type: "text", text: "You are Mark.", cache_control: { type: "ephemeral" } }]);
  });

  it("sends every message as blocks, so the breakpoint always has somewhere to go", async () => {
    const { seen } = await run(steps);
    for (const call of seen) for (const m of call.messages) expect(Array.isArray(m.content)).toBe(true);
  });

  it("MOVES the transcript breakpoint: exactly one, always on the last block", async () => {
    const { seen } = await run(steps);
    expect(seen.length).toBe(4);
    for (const call of seen) {
      expect(breakpoints(call.messages)).toBe(1);
      const last = call.messages[call.messages.length - 1];
      const lastBlock = (last.content as Block[])[(last.content as Block[]).length - 1];
      expect(lastBlock).toHaveProperty("cache_control", { type: "ephemeral" });
    }
    // The transcript grew — which is what the cache is paying for.
    expect(seen[3].messages.length).toBeGreaterThan(seen[0].messages.length);
  });

  it("spends the budget on the WHOLE context, cached reads included", async () => {
    // 1,000 uncached + 99,500 read from cache: over a 100k budget after one
    // round. Counting input_tokens alone (1,000) would let it run on.
    const { result, calls } = await run(
      [{ toolUses: [use("t1")], usage: { input_tokens: 1_000, cache_read_input_tokens: 99_500, cache_creation_input_tokens: 0, output_tokens: 50 } }],
      { tokenBudget: 100_000 },
    );
    expect(calls()).toBe(1);
    expect(result.stop).toBe("budget");
    expect(result.contextTokens).toBe(100_500);
    expect(result.text).toContain("BUDGET");
  });

  it("counts a cache write too", async () => {
    const { result } = await run([
      { toolUses: [use("t1")], usage: { input_tokens: 400, cache_creation_input_tokens: 16_000, output_tokens: 10 } },
      { text: "ok", usage: { input_tokens: 50, cache_read_input_tokens: 16_000, output_tokens: 5 } },
    ]);
    expect(result.contextTokens).toBe(16_400 + 16_050);
    expect(result.outputTokens).toBe(15);
  });
});
