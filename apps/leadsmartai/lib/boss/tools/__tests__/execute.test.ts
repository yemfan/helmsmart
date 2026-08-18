import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/closeboss/autopilot", () => ({
  effectiveAutopilot: vi.fn(async () => false),
}));
vi.mock("@/lib/closeboss/activities", () => ({
  logAssistantActivity: vi.fn(async () => undefined),
}));
vi.mock("../registry", () => ({
  getBossTool: () => null,
}));

// eslint-disable-next-line import/first
import { z } from "zod";
// eslint-disable-next-line import/first
import { executeTool, InMemoryIdempotencyStore, type ExecuteDeps } from "../execute";
// eslint-disable-next-line import/first
import { defineTool, newRunState, type BossTool, type ToolContext } from "../types";

function ctx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    agentId: "agent-1",
    runId: "run-1",
    stepIndex: 0,
    assignee: "sales_assistant",
    runState: newRunState(),
    ...overrides,
  };
}

function deps(overrides: Partial<ExecuteDeps> = {}): ExecuteDeps {
  return {
    resolveAutopilot: vi.fn(async () => true),
    getContactConsent: vi.fn(async () => ({ doNotContactSms: false, doNotContactEmail: false })),
    logActivity: vi.fn(async () => undefined),
    idempotency: new InMemoryIdempotencyStore(),
    ...overrides,
  };
}

const echoTool = defineTool({
  name: "echo",
  description: "test tool",
  inputSchema: z.object({ msg: z.string() }),
  riskClass: "research",
  assignee: "sales_assistant",
  execute: async (_c, input) => ({ status: "completed", summary: input.msg }),
});

const outboundSms = (executed: { count: number }, proposed: { count: number }) =>
  defineTool({
    name: "send_test",
    description: "outbound test tool",
    inputSchema: z.object({ contact_id: z.string() }),
    riskClass: "outbound",
    assignee: "sales_assistant",
    outbound: {
      channel: () => "sms" as const,
      contactId: (i) => i.contact_id,
    },
    execute: async () => {
      executed.count += 1;
      return { status: "completed", summary: "sent" };
    },
    propose: async () => {
      proposed.count += 1;
      return { status: "pending_approval", summary: "parked for approval" };
    },
  });

function registryOf(...tools: BossTool<never>[]): Pick<ExecuteDeps, "getTool"> {
  const map = new Map(tools.map((t) => [t.name, t as unknown as BossTool<unknown>]));
  return { getTool: (name: string) => map.get(name) ?? null };
}

describe("executeTool", () => {
  it("runs a research tool and audits it", async () => {
    const d = deps(registryOf(echoTool as never));
    const out = await executeTool(ctx(), "echo", { msg: "hi" }, d);
    expect(out).toEqual({ status: "completed", summary: "hi" });
    expect(d.logActivity).toHaveBeenCalledTimes(1);
    expect(vi.mocked(d.logActivity).mock.calls[0][0].activityType).toBe("boss_tool_completed");
  });

  it("rejects unknown tools", async () => {
    const out = await executeTool(ctx(), "nope", {}, deps());
    expect(out.status).toBe("failed");
  });

  it("fails invalid input without executing", async () => {
    const d = deps(registryOf(echoTool as never));
    const out = await executeTool(ctx(), "echo", { msg: 42 }, d);
    expect(out.status).toBe("failed");
  });

  it("ask mode routes outbound to propose() — the send path is never called", async () => {
    const executed = { count: 0 };
    const proposed = { count: 0 };
    const d = deps({
      ...registryOf(outboundSms(executed, proposed) as never),
      resolveAutopilot: vi.fn(async () => false),
    });
    const out = await executeTool(ctx(), "send_test", { contact_id: "c1" }, d);
    expect(out.status).toBe("pending_approval");
    expect(executed.count).toBe(0);
    expect(proposed.count).toBe(1);
  });

  it("auto mode executes outbound", async () => {
    const executed = { count: 0 };
    const proposed = { count: 0 };
    const d = deps(registryOf(outboundSms(executed, proposed) as never));
    const out = await executeTool(ctx(), "send_test", { contact_id: "c1" }, d);
    expect(out.status).toBe("completed");
    expect(executed.count).toBe(1);
  });

  it("consent blocks outbound sms even in auto mode", async () => {
    const executed = { count: 0 };
    const d = deps({
      ...registryOf(outboundSms(executed, { count: 0 }) as never),
      getContactConsent: vi.fn(async () => ({ doNotContactSms: true, doNotContactEmail: false })),
    });
    const out = await executeTool(ctx(), "send_test", { contact_id: "c1" }, d);
    expect(out.status).toBe("rejected");
    expect(executed.count).toBe(0);
  });

  it("financial tools are always rejected", async () => {
    const fin = defineTool({
      name: "wire_money",
      description: "never",
      inputSchema: z.object({}),
      riskClass: "financial",
      assignee: "accountant",
      execute: async () => ({ status: "completed", summary: "should not happen" }),
    });
    const d = deps(registryOf(fin as never));
    const out = await executeTool(ctx(), "wire_money", {}, d);
    expect(out.status).toBe("rejected");
  });

  it("enforces the per-run tool budget", async () => {
    const d = deps(registryOf(echoTool as never));
    const c = ctx({ runState: newRunState(2) });
    expect((await executeTool(c, "echo", { msg: "1" }, d)).status).toBe("completed");
    c.stepIndex = 1;
    expect((await executeTool(c, "echo", { msg: "2" }, d)).status).toBe("completed");
    c.stepIndex = 2;
    const out = await executeTool(c, "echo", { msg: "3" }, d);
    expect(out.status).toBe("rejected");
  });

  it("idempotency: a retried (runId, stepIndex) returns the recorded outcome without re-running", async () => {
    let calls = 0;
    const once = defineTool({
      name: "once",
      description: "count calls",
      inputSchema: z.object({}),
      riskClass: "crm_write",
      assignee: "sales_assistant",
      execute: async () => {
        calls += 1;
        return { status: "completed", summary: `call ${calls}` };
      },
    });
    const d = deps(registryOf(once as never));
    const c = ctx();
    const first = await executeTool(c, "once", {}, d);
    const retry = await executeTool(c, "once", {}, d);
    expect(calls).toBe(1);
    expect(retry).toEqual(first);
  });

  it("caps voice calls at one per contact per run", async () => {
    let dials = 0;
    const call = defineTool({
      name: "call_test",
      description: "voice",
      inputSchema: z.object({ contact_id: z.string() }),
      riskClass: "outbound",
      assignee: "sales_assistant",
      outbound: { channel: () => "call" as const, contactId: (i) => i.contact_id },
      execute: async () => {
        dials += 1;
        return { status: "completed", summary: "queued" };
      },
    });
    const d = deps(registryOf(call as never));
    const c = ctx();
    expect((await executeTool(c, "call_test", { contact_id: "c1" }, d)).status).toBe("completed");
    c.stepIndex = 1;
    const second = await executeTool(c, "call_test", { contact_id: "c1" }, d);
    expect(second.status).toBe("rejected");
    c.stepIndex = 2;
    const other = await executeTool(c, "call_test", { contact_id: "c2" }, d);
    expect(other.status).toBe("completed");
    expect(dials).toBe(2);
  });

  it("a throwing tool yields failed, not an exception", async () => {
    const boom = defineTool({
      name: "boom",
      description: "throws",
      inputSchema: z.object({}),
      riskClass: "research",
      assignee: "sales_assistant",
      execute: async () => {
        throw new Error("kaput");
      },
    });
    const d = deps(registryOf(boom as never));
    const out = await executeTool(ctx(), "boom", {}, d);
    expect(out).toEqual({ status: "failed", error: "kaput" });
  });
});
