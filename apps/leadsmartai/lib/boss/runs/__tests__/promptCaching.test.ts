import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/closeboss/autopilot", () => ({ effectiveAutopilot: vi.fn(async () => false) }));
vi.mock("@/lib/closeboss/activities", () => ({ logAssistantActivity: vi.fn(async () => undefined) }));
vi.mock("../../tools/registry", () => {
  const { z } = require("zod");
  const tools = [
    {
      name: "research_tool",
      description: "look something up",
      inputSchema: z.object({ q: z.string() }),
      riskClass: "research",
      assignee: "sales_assistant",
      execute: async (_ctx: unknown, input: { q: string }) => ({
        status: "completed",
        summary: `found: ${input.q}`,
        data: { q: input.q },
      }),
    },
  ];
  return {
    listBossTools: () => tools,
    getBossTool: (name: string) => tools.find((t) => t.name === name) ?? null,
  };
});

// eslint-disable-next-line import/first
import { driveRun, type EngineDeps, type ModelClient, type ModelResponse } from "../engine";
// eslint-disable-next-line import/first
import { InMemoryRunStore, type BossRunRow } from "../store";
// eslint-disable-next-line import/first
import { cacheHitRatio, totalContextTokens } from "../tokenAccounting";

/**
 * These pin the fix for "why does Ask Max cost so much".
 *
 * The Boss loop was the one major model path with no prompt caching: every tool
 * round-trip re-sent the system prompt, all the tool schemas and the whole
 * transcript at full input price. The suite passed before the fix and after it,
 * because nothing here asserted anything about caching — which is exactly how
 * it stayed uncached while nine other paths were converted.
 */

function makeRun(overrides: Partial<BossRunRow> = {}): BossRunRow {
  return {
    id: "run-1",
    agent_id: "agent-1",
    trigger: "command",
    instruction_id: null,
    status: "planning",
    objective: "Find comparable sales near 123 Main St",
    plan_json: null,
    messages_json: [],
    report: null,
    error: null,
    tool_calls: 0,
    max_tool_calls: 25,
    input_tokens: 0,
    output_tokens: 0,
    token_budget: 250_000,
    verify_done: false,
    ...overrides,
  };
}

type Block = Record<string, unknown>;
type Msg = { role: string; content: string | Block[] };

/** Count cache breakpoints across a whole transcript. */
function breakpointCount(messages: Msg[]): number {
  let n = 0;
  for (const m of messages) {
    if (!Array.isArray(m.content)) continue;
    for (const b of m.content) if (b && typeof b === "object" && "cache_control" in b) n += 1;
  }
  return n;
}

/** Records a deep copy of the transcript as it was at each model call. */
function recordingModel(script: Array<Partial<ModelResponse>>): {
  client: ModelClient;
  seen: Msg[][];
} {
  const seen: Msg[][] = [];
  let i = 0;
  const client: ModelClient = {
    async createMessage(args) {
      seen.push(JSON.parse(JSON.stringify(args.messages)) as Msg[]);
      const s = script[Math.min(i, script.length - 1)];
      i += 1;
      return {
        text: s.text ?? "",
        toolUses: s.toolUses ?? [],
        stopReason: s.stopReason ?? (s.toolUses?.length ? "tool_use" : "end_turn"),
        inputTokens: s.inputTokens ?? 100,
        outputTokens: s.outputTokens ?? 50,
        rawContent: s.rawContent ?? [{ type: "text", text: s.text ?? "" }],
      };
    },
  };
  return { client, seen };
}

function deps(store: InMemoryRunStore, model: ModelClient): EngineDeps {
  return {
    store,
    model,
    buildSystemPrompt: async () => "system prompt",
    executeDeps: {
      resolveAutopilot: vi.fn(async () => false),
      getContactConsent: vi.fn(async () => ({ doNotContactSms: false, doNotContactEmail: false })),
      logActivity: vi.fn(async () => undefined),
    },
  };
}

/** Drives a loop of several tool round-trips, then a final answer. */
async function driveMultiRound() {
  const store = new InMemoryRunStore();
  store.runs.set("run-1", makeRun());
  const { client, seen } = recordingModel([
    {
      text: "Plan: look it up",
      toolUses: [{ id: "t1", name: "research_tool", input: { q: "123 Main St" } }],
      rawContent: [
        { type: "text", text: "Plan: look it up" },
        { type: "tool_use", id: "t1", name: "research_tool", input: { q: "123 Main St" } },
      ],
    },
    {
      toolUses: [{ id: "t2", name: "research_tool", input: { q: "recent sales" } }],
      rawContent: [
        { type: "tool_use", id: "t2", name: "research_tool", input: { q: "recent sales" } },
      ],
    },
    {
      toolUses: [{ id: "t3", name: "research_tool", input: { q: "price trend" } }],
      rawContent: [{ type: "tool_use", id: "t3", name: "research_tool", input: { q: "price trend" } }],
    },
    { text: "All steps handled." },
    { text: "DONE: comps found. NEEDS YOU: nothing." },
  ]);
  await driveRun("run-1", deps(store, client));
  return seen;
}

describe("Boss loop prompt caching", () => {
  it("places a cache breakpoint on the transcript before each model call", async () => {
    const seen = await driveMultiRound();
    // Round 1 sends only the bare objective as a string — nothing to attach a
    // breakpoint to, and too short to cache anyway. From round 2 the transcript
    // carries real blocks and must be marked.
    const withBlocks = seen.filter((m) => m.some((x) => Array.isArray(x.content)));
    expect(withBlocks.length).toBeGreaterThan(0);
    for (const transcript of withBlocks) {
      expect(breakpointCount(transcript)).toBeGreaterThan(0);
    }
  });

  it("MOVES the breakpoint instead of accumulating them", async () => {
    const seen = await driveMultiRound();
    // The API allows four. A loop that left one behind per round would exceed
    // that within a few tool calls and start failing outright.
    for (const transcript of seen) {
      expect(breakpointCount(transcript)).toBeLessThanOrEqual(1);
    }
  });

  it("marks the END of the transcript, so the round reads all prior rounds", async () => {
    const seen = await driveMultiRound();
    const last = seen[seen.length - 1];
    const lastMsg = last[last.length - 1];
    if (Array.isArray(lastMsg.content)) {
      const lastBlock = lastMsg.content[lastMsg.content.length - 1];
      expect(lastBlock).toHaveProperty("cache_control");
    }
    // ...and nothing earlier still carries one.
    const earlier = last.slice(0, -1);
    expect(breakpointCount(earlier)).toBe(0);
  });

  it("grows the transcript across rounds (the thing caching is paying for)", async () => {
    const seen = await driveMultiRound();
    expect(seen.length).toBeGreaterThanOrEqual(3);
    expect(seen[seen.length - 1].length).toBeGreaterThan(seen[0].length);
  });
});

describe("totalContextTokens", () => {
  // The budget guard is spent using this number. If it ever narrows to the
  // uncached remainder, runs silently get several times their allotted budget.
  it("counts cached reads and writes, not just the uncached remainder", () => {
    expect(
      totalContextTokens({
        input_tokens: 1_200,
        cache_read_input_tokens: 16_000,
        cache_creation_input_tokens: 0,
      }),
    ).toBe(17_200);
  });

  it("matches plain input_tokens when nothing is cached", () => {
    expect(totalContextTokens({ input_tokens: 19_667 })).toBe(19_667);
  });

  it("counts the write on the round that populates the cache", () => {
    expect(
      totalContextTokens({
        input_tokens: 400,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 16_000,
      }),
    ).toBe(16_400);
  });

  it("survives a malformed or absent usage object", () => {
    expect(totalContextTokens(undefined)).toBe(0);
    expect(totalContextTokens({ input_tokens: "lots" })).toBe(0);
  });
});

describe("cacheHitRatio", () => {
  it("reports the share served from cache", () => {
    expect(
      cacheHitRatio({ input_tokens: 1_000, cache_read_input_tokens: 9_000 }),
    ).toBeCloseTo(0.9);
  });

  it("is 0 when the breakpoints never hit — the failure that looks like success", () => {
    expect(cacheHitRatio({ input_tokens: 19_667 })).toBe(0);
  });

  it("does not divide by zero on an empty call", () => {
    expect(cacheHitRatio({})).toBe(0);
  });
});
