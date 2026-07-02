import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/realtyboss/autopilot", () => ({ effectiveAutopilot: vi.fn(async () => true) }));
vi.mock("@/lib/realtyboss/activities", () => ({ logAssistantActivity: vi.fn(async () => undefined) }));
vi.mock("../../tools/registry", () => {
  const { z } = require("zod");
  const tools = [
    {
      name: "send_tool",
      description: "outbound send",
      inputSchema: z.object({ contact_id: z.string() }),
      riskClass: "outbound",
      assignee: "sales_assistant",
      outbound: { channel: () => "sms", contactId: (i: { contact_id: string }) => i.contact_id },
      execute: async () => ({ status: "completed", summary: "SENT (should never happen overnight)" }),
      propose: async () => ({ status: "pending_approval", summary: "drafted for morning" }),
    },
    {
      name: "call_tool",
      description: "voice call",
      inputSchema: z.object({ contact_id: z.string() }),
      riskClass: "outbound",
      assignee: "sales_assistant",
      outbound: { channel: () => "call", contactId: (i: { contact_id: string }) => i.contact_id },
      execute: async () => ({ status: "completed", summary: "DIALED (should never happen overnight)" }),
      propose: async () => ({ status: "pending_approval", summary: "call proposed" }),
    },
  ];
  return {
    listBossTools: () => tools,
    getBossTool: (name: string) => tools.find((t) => t.name === name) ?? null,
  };
});

// eslint-disable-next-line import/first
import { executeTool, InMemoryIdempotencyStore, type ExecuteDeps } from "../../tools/execute";
// eslint-disable-next-line import/first
import { newRunState, type ToolContext } from "../../tools/types";
// eslint-disable-next-line import/first
import { driveRun, type EngineDeps, type ModelClient } from "../engine";
// eslint-disable-next-line import/first
import { InMemoryRunStore, type BossRunRow } from "../store";
// eslint-disable-next-line import/first
import { buildOvernightObjective, OVERNIGHT_MAX_TOOLS } from "../overnight";

function ctx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    agentId: "agent-1",
    runId: "run-1",
    stepIndex: 0,
    assignee: "sales_assistant",
    runState: newRunState(OVERNIGHT_MAX_TOOLS),
    overnight: true,
    ...overrides,
  };
}

function deps(): ExecuteDeps {
  return {
    resolveAutopilot: vi.fn(async () => true), // even full-auto agents…
    getContactConsent: vi.fn(async () => ({ doNotContactSms: false, doNotContactEmail: false })),
    logActivity: vi.fn(async () => undefined),
    idempotency: new InMemoryIdempotencyStore(),
  };
}

describe("overnight rails", () => {
  it("rejects voice calls outright, even in auto mode", async () => {
    const out = await executeTool(ctx(), "call_tool", { contact_id: "c1" }, deps());
    expect(out.status).toBe("rejected");
  });

  it("forces sms/email outbound to propose() — drafts only, even in auto mode", async () => {
    const out = await executeTool(ctx(), "send_tool", { contact_id: "c1" }, deps());
    expect(out.status).toBe("pending_approval");
    expect(out.status === "pending_approval" && out.summary).toBe("drafted for morning");
  });

  it("an overnight run keeps working past parked drafts and finishes with the brief", async () => {
    const store = new InMemoryRunStore();
    const run: BossRunRow = {
      id: "run-1",
      agent_id: "agent-1",
      trigger: "overnight",
      instruction_id: null,
      status: "planning",
      objective: buildOvernightObjective(),
      plan_json: null,
      messages_json: [],
      report: null,
      error: null,
      tool_calls: 0,
      max_tool_calls: OVERNIGHT_MAX_TOOLS,
      input_tokens: 0,
      output_tokens: 0,
      token_budget: 250_000,
      verify_done: false,
    };
    store.runs.set("run-1", run);

    let call = 0;
    const model: ModelClient = {
      async createMessage() {
        call += 1;
        if (call === 1) {
          return {
            text: "Plan: draft two re-engagements",
            toolUses: [
              { id: "t1", name: "send_tool", input: { contact_id: "c1" } },
              { id: "t2", name: "send_tool", input: { contact_id: "c2" } },
            ],
            stopReason: "tool_use",
            inputTokens: 100,
            outputTokens: 50,
            rawContent: [
              { type: "text", text: "Plan: draft two re-engagements" },
              { type: "tool_use", id: "t1", name: "send_tool", input: { contact_id: "c1" } },
              { type: "tool_use", id: "t2", name: "send_tool", input: { contact_id: "c2" } },
            ],
          };
        }
        return {
          text: "DONE: research\nDRAFTED — APPROVE: 2 texts\nNEEDS YOU: nothing",
          toolUses: [],
          stopReason: "end_turn",
          inputTokens: 100,
          outputTokens: 50,
          rawContent: [{ type: "text", text: "DONE: research\nDRAFTED — APPROVE: 2 texts\nNEEDS YOU: nothing" }],
        };
      },
    };
    const engineDeps: EngineDeps = {
      store,
      model,
      buildSystemPrompt: async () => "sys",
      executeDeps: {
        resolveAutopilot: vi.fn(async () => true),
        getContactConsent: vi.fn(async () => ({ doNotContactSms: false, doNotContactEmail: false })),
        logActivity: vi.fn(async () => undefined),
      },
    };
    const result = await driveRun("run-1", engineDeps);
    // Both outbound steps parked, run did NOT pause — it completed with a brief.
    expect(result.status).toBe("completed");
    const steps = await store.loadSteps("run-1");
    expect(steps.filter((s) => s.approval_state === "pending")).toHaveLength(2);
    const done = await store.loadRun("run-1");
    expect(done?.report).toContain("DRAFTED");
  });
});
