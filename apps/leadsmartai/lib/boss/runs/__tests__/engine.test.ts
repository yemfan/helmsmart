import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/realtyboss/autopilot", () => ({ effectiveAutopilot: vi.fn(async () => false) }));
vi.mock("@/lib/realtyboss/activities", () => ({ logAssistantActivity: vi.fn(async () => undefined) }));
// The engine reads the real registry for schemas; stub it with two fake tools.
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
    {
      name: "send_tool",
      description: "outbound send",
      inputSchema: z.object({ contact_id: z.string() }),
      riskClass: "outbound",
      assignee: "sales_assistant",
      outbound: {
        channel: () => "sms",
        contactId: (i: { contact_id: string }) => i.contact_id,
      },
      execute: async () => ({ status: "completed", summary: "sent!" }),
      propose: async () => ({ status: "pending_approval", summary: "parked for approval" }),
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

function makeRun(overrides: Partial<BossRunRow> = {}): BossRunRow {
  return {
    id: "run-1",
    agent_id: "agent-1",
    trigger: "command",
    instruction_id: null,
    status: "planning",
    objective: "Set up Saturday's open house at 123 Main St",
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

/** Scripted model: pops one response per call. */
function scriptedModel(script: Array<Partial<ModelResponse>>): ModelClient {
  let i = 0;
  return {
    async createMessage() {
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
}

function deps(store: InMemoryRunStore, model: ModelClient, extra: Partial<EngineDeps> = {}): EngineDeps {
  return {
    store,
    model,
    buildSystemPrompt: async () => "system prompt",
    executeDeps: {
      resolveAutopilot: vi.fn(async () => false), // ask mode
      getContactConsent: vi.fn(async () => ({ doNotContactSms: false, doNotContactEmail: false })),
      logActivity: vi.fn(async () => undefined),
    },
    ...extra,
  };
}

describe("driveRun", () => {
  it("E2E: plans, runs research, parks outbound for approval, resumes on approval, verifies, reports", async () => {
    const store = new InMemoryRunStore();
    store.runs.set("run-1", makeRun());

    const model = scriptedModel([
      {
        text: "Plan: 1) research the property 2) draft outreach",
        toolUses: [{ id: "t1", name: "research_tool", input: { q: "123 Main St" } }],
        rawContent: [
          { type: "text", text: "Plan: 1) research the property 2) draft outreach" },
          { type: "tool_use", id: "t1", name: "research_tool", input: { q: "123 Main St" } },
        ],
      },
      {
        toolUses: [{ id: "t2", name: "send_tool", input: { contact_id: "c1" } }],
        rawContent: [{ type: "tool_use", id: "t2", name: "send_tool", input: { contact_id: "c1" } }],
      },
      // after approval resume:
      { text: "All steps handled." },
      { text: "DONE: research complete. DRAFTED: outreach approved and sent. NEEDS YOU: nothing." },
    ]);
    const d = deps(store, model);

    // First drive: plan + research + outbound → pauses for approval.
    const first = await driveRun("run-1", d);
    expect(first).toEqual({ status: "awaiting_approval", needsContinuation: false });

    const run1 = await store.loadRun("run-1");
    expect(run1?.plan_json).toEqual({ plan: "Plan: 1) research the property 2) draft outreach" });
    const steps = await store.loadSteps("run-1");
    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({ tool_name: "research_tool", status: "completed" });
    expect(steps[1]).toMatchObject({
      tool_name: "send_tool",
      status: "pending_approval",
      approval_state: "pending",
    });

    // Simulate the approval decision path: mark approved + resume message.
    await store.finishStep("run-1", 1, { approval_state: "approved", status: "completed" });
    const r = await store.loadRun("run-1");
    await store.updateRun("run-1", {
      status: "running",
      messages_json: [
        ...(r?.messages_json ?? []),
        { role: "user", content: "The realtor APPROVED step 1. Result: sent. Continue." },
      ],
    });

    // Second drive: model wraps up → verify turn fires → final report.
    const second = await driveRun("run-1", d);
    expect(second).toEqual({ status: "completed", needsContinuation: false });
    const done = await store.loadRun("run-1");
    expect(done?.report).toContain("DONE");
    expect(done?.verify_done).toBe(true);
  });

  it("ask-mode outbound never executes the send path", async () => {
    const store = new InMemoryRunStore();
    store.runs.set("run-1", makeRun());
    const model = scriptedModel([
      {
        toolUses: [{ id: "t1", name: "send_tool", input: { contact_id: "c9" } }],
        rawContent: [{ type: "tool_use", id: "t1", name: "send_tool", input: { contact_id: "c9" } }],
      },
    ]);
    const result = await driveRun("run-1", deps(store, model));
    expect(result.status).toBe("awaiting_approval");
    const steps = await store.loadSteps("run-1");
    expect(steps[0].output_json?.status).toBe("pending_approval");
  });

  it("batches outbound approvals fired in one turn, but still defers dependent work", async () => {
    const store = new InMemoryRunStore();
    store.runs.set("run-batch", makeRun({ id: "run-batch" }));

    // One turn, three calls: two sends (independent — each only proposes) and a
    // research step that may assume the sends went out.
    const model = scriptedModel([
      {
        toolUses: [
          { id: "t1", name: "send_tool", input: { contact_id: "c1" } },
          { id: "t2", name: "send_tool", input: { contact_id: "c2" } },
          { id: "t3", name: "research_tool", input: { q: "after the sends" } },
        ],
        rawContent: [
          { type: "tool_use", id: "t1", name: "send_tool", input: { contact_id: "c1" } },
          { type: "tool_use", id: "t2", name: "send_tool", input: { contact_id: "c2" } },
          { type: "tool_use", id: "t3", name: "research_tool", input: { q: "after the sends" } },
        ],
      },
    ]);

    const result = await driveRun("run-batch", deps(store, model));
    expect(result.status).toBe("awaiting_approval");

    const steps = await store.loadSteps("run-batch");
    // Both sends parked together — the realtor decides once, not in a trickle.
    expect(steps[0]).toMatchObject({ tool_name: "send_tool", status: "pending_approval" });
    expect(steps[1]).toMatchObject({ tool_name: "send_tool", status: "pending_approval" });
    // The non-outbound step is deferred entirely (no step recorded) — it may
    // assume the parked sends happened, so it re-plans after the decision.
    expect(steps).toHaveLength(2);
  });

  it("ends budget_exceeded when the token budget is exhausted, keeping partial work", async () => {
    const store = new InMemoryRunStore();
    store.runs.set("run-1", makeRun({ token_budget: 120 }));
    const model = scriptedModel([
      {
        text: "working…",
        toolUses: [{ id: "t1", name: "research_tool", input: { q: "a" } }],
        rawContent: [
          { type: "text", text: "working…" },
          { type: "tool_use", id: "t1", name: "research_tool", input: { q: "a" } },
        ],
      },
      { text: "next" },
    ]);
    const result = await driveRun("run-1", deps(store, model));
    expect(result.status).toBe("budget_exceeded");
    const run = await store.loadRun("run-1");
    expect(run?.status).toBe("budget_exceeded");
    expect((await store.loadSteps("run-1")).length).toBe(1);
  });

  it("yields for continuation at the soft deadline instead of dying mid-run", async () => {
    const store = new InMemoryRunStore();
    store.runs.set("run-1", makeRun());
    let clock = 0;
    const model = scriptedModel([
      {
        toolUses: [{ id: "t1", name: "research_tool", input: { q: "a" } }],
        rawContent: [{ type: "tool_use", id: "t1", name: "research_tool", input: { q: "a" } }],
      },
      { text: "unreachable in this invocation" },
    ]);
    const result = await driveRun("run-1", {
      ...deps(store, model),
      softDeadlineMs: 1000,
      now: () => {
        clock += 600; // two ticks cross the 1s deadline
        return clock;
      },
    });
    expect(result).toEqual({ status: "running", needsContinuation: true });
    // Transcript persisted → a fresh invocation can resume.
    const run = await store.loadRun("run-1");
    expect((run?.messages_json ?? []).length).toBeGreaterThan(0);
  });

  it("retried steps reuse the recorded outcome (idempotency via boss_run_steps)", async () => {
    const store = new InMemoryRunStore();
    store.runs.set("run-1", makeRun());
    // Pre-record step 0 as already completed (a prior crashed invocation).
    await store.claimStep({
      runId: "run-1",
      stepIndex: 0,
      toolName: "research_tool",
      riskClass: "research",
      input: { q: "a" },
    });
    await store.finishStep("run-1", 0, {
      status: "completed",
      output_json: { status: "completed", summary: "cached result" },
    });
    const model = scriptedModel([
      {
        toolUses: [{ id: "t1", name: "research_tool", input: { q: "a" } }],
        rawContent: [{ type: "tool_use", id: "t1", name: "research_tool", input: { q: "a" } }],
      },
      { text: "wrap" },
      { text: "final report" },
    ]);
    const result = await driveRun("run-1", deps(store, model));
    expect(result.status).toBe("completed");
    // The transcript's tool_result carries the cached outcome.
    const run = await store.loadRun("run-1");
    const flat = JSON.stringify(run?.messages_json);
    expect(flat).toContain("cached result");
  });
});
