import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// The engine pulls the real registry (whose tool impls construct the admin
// client at module load). Evals never execute registry tools — getTools is
// injected — so stub the client out.
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/realtyboss/autopilot", () => ({ effectiveAutopilot: async () => false }));
vi.mock("@/lib/realtyboss/activities", () => ({ logAssistantActivity: async () => undefined }));

/**
 * Boss v2 eval harness (HANDOFF_BOSS_V2 PR-6): 10 golden commands driven
 * through the REAL agent loop with the REAL model and the REAL tool schemas,
 * but synthetic tool executors (no DB, no sends). Asserts plan shape, tool
 * selection, gate behavior, and the no-send-in-ask invariant.
 *
 * Live-model suite — costs real tokens, needs ANTHROPIC_API_KEY. Run with:
 *   pnpm boss:evals        (sets BOSS_EVAL_LIVE=1)
 * Skipped entirely otherwise, so the default vitest/CI run stays free.
 */

const LIVE = process.env.BOSS_EVAL_LIVE === "1" && !!process.env.ANTHROPIC_API_KEY;

// eslint-disable-next-line import/first
import { z } from "zod";
// eslint-disable-next-line import/first
import { driveRun, type EngineDeps, type ModelClient, type ModelResponse } from "../runs/engine";
// eslint-disable-next-line import/first
import { InMemoryRunStore, type BossRunRow } from "../runs/store";
// eslint-disable-next-line import/first
import { defineTool, type BossTool } from "../tools/types";

// ── synthetic tool set: real names/schemas/descriptions, canned results ──

const sent: string[] = [];

function evalTools(): BossTool<never>[] {
  const tools = [
    defineTool({
      name: "query_crm",
      description:
        "Read-only CRM lookups. Queries: pipeline_summary, hot_leads, stale_hot_leads, overdue_tasks, upcoming_deadlines, find_contact (needs name).",
      inputSchema: z.object({
        query: z.enum([
          "pipeline_summary",
          "hot_leads",
          "stale_hot_leads",
          "overdue_tasks",
          "upcoming_deadlines",
          "find_contact",
        ]),
        name: z.string().optional(),
      }),
      riskClass: "research",
      assignee: "sales_assistant",
      execute: async (_c, input) => ({
        status: "completed",
        summary: `${input.query} ok`,
        data:
          input.query === "find_contact"
            ? { contacts: [{ id: "11111111-1111-4111-8111-111111111111", name: input.name ?? "Jane Chen", phone_number: "+16265550100", email: "jane@example.com", preferred_language: "zh-Hans" }] }
            : input.query === "upcoming_deadlines"
              ? { transactions: [{ id: "tx-1", property_address: "87 Birchwood Ln", closing_date: "2026-07-10", status: "active" }] }
              : input.query === "stale_hot_leads"
                ? { leads: [{ id: "22222222-2222-4222-8222-222222222222", name: "Marco Diaz", last_contacted_at: "2026-06-10" }] }
                : { total: 13, by_stage: { lead: 9, active_client: 3, past_client: 1 } },
      }),
    }),
    defineTool({
      name: "run_cma",
      description: "Generate a CMA / home valuation with live comps for an address.",
      inputSchema: z.object({ address: z.string().min(5), contact_id: z.string().uuid().optional() }),
      riskClass: "research",
      assignee: "sales_assistant",
      execute: async (_c, input) => ({
        status: "completed",
        summary: `CMA ready for ${input.address}`,
        artifactUrl: "/dashboard/cma/eval-1",
      }),
    }),
    defineTool({
      name: "generate_seller_presentation",
      description: "Build a full AI seller/listing presentation for an address.",
      inputSchema: z.object({ address: z.string().min(5) }),
      riskClass: "draft",
      assignee: "sales_assistant",
      execute: async () => ({
        status: "completed",
        summary: "Presentation ready",
        artifactUrl: "/presentation/eval-1",
      }),
    }),
    defineTool({
      name: "house_search",
      description: "Run an AI home search from natural-language criteria; saves to a buyer when contact_id given.",
      inputSchema: z.object({ criteria: z.string().min(8), contact_id: z.string().uuid().optional() }),
      riskClass: "research",
      assignee: "sales_assistant",
      execute: async () => ({ status: "completed", summary: "8 matches", artifactUrl: "/dashboard/house-search" }),
    }),
    defineTool({
      name: "draft_message",
      description: "Draft an SMS or email to a contact (does NOT send). Returns draft_id.",
      inputSchema: z.object({
        contact_id: z.string().uuid(),
        channel: z.enum(["sms", "email"]),
        intent: z.string().min(3),
        context: z.string().optional(),
      }),
      riskClass: "draft",
      assignee: "sales_assistant",
      execute: async (_c, input) => ({
        status: "completed",
        summary: `Drafted ${input.channel}`,
        data: { draft_id: "33333333-3333-4333-8333-333333333333", body: "Hi!" },
      }),
    }),
    defineTool({
      name: "send_message",
      description: "Send a previously drafted message. Requires draft_id from draft_message.",
      inputSchema: z.object({
        draft_id: z.string().uuid(),
        channel: z.enum(["sms", "email"]),
        contact_id: z.string().uuid(),
      }),
      riskClass: "outbound",
      assignee: "sales_assistant",
      outbound: { channel: (i) => i.channel, contactId: (i) => i.contact_id },
      execute: async (_c, input) => {
        sent.push(input.draft_id);
        return { status: "completed", summary: "sent" };
      },
      propose: async () => ({ status: "pending_approval", summary: "parked for approval" }),
    }),
    defineTool({
      name: "schedule_voice_call",
      description: "Queue an outbound AI voice call to a contact with an objective.",
      inputSchema: z.object({ contact_id: z.string().uuid(), objective: z.string().min(8) }),
      riskClass: "outbound",
      assignee: "sales_assistant",
      outbound: { channel: () => "call" as const, contactId: (i) => i.contact_id },
      execute: async () => {
        sent.push("voice");
        return { status: "completed", summary: "call queued" };
      },
      propose: async () => ({ status: "pending_approval", summary: "call proposed" }),
    }),
    defineTool({
      name: "create_task",
      description: "Create a CRM task for the realtor with priority and optional due time.",
      inputSchema: z.object({
        title: z.string().min(3),
        description: z.string().optional(),
        contact_id: z.string().uuid().optional(),
        priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
        due_at: z.string().optional(),
      }),
      riskClass: "crm_write",
      assignee: "sales_assistant",
      execute: async (_c, input) => ({ status: "completed", summary: `Task: ${input.title}` }),
    }),
    defineTool({
      name: "create_calendar_event",
      description: "Create a calendar event (showing, appointment, open house block).",
      inputSchema: z.object({
        title: z.string().min(3),
        starts_at: z.string(),
        ends_at: z.string().optional(),
        contact_id: z.string().uuid().optional(),
      }),
      riskClass: "crm_write",
      assignee: "receptionist",
      execute: async (_c, input) => ({ status: "completed", summary: `Event: ${input.title}` }),
    }),
    defineTool({
      name: "publish_social_post",
      description: "Publish a social post NOW on a connected account.",
      inputSchema: z.object({
        platform: z.enum(["facebook", "instagram", "linkedin"]),
        caption: z.string().min(10),
        hashtags: z.array(z.string()).optional(),
      }),
      riskClass: "outbound",
      assignee: "marketing_assistant",
      outbound: { channel: () => "social" as const },
      execute: async () => {
        sent.push("social");
        return { status: "completed", summary: "published" };
      },
      propose: async () => ({ status: "pending_approval", summary: "post drafted" }),
    }),
    defineTool({
      name: "get_market_snapshot",
      description: "Cached market snapshot for a city (median price, trend, DOM).",
      inputSchema: z.object({ city: z.string().min(2), state: z.string().optional() }),
      riskClass: "research",
      assignee: "sales_assistant",
      execute: async (_c, input) => ({
        status: "completed",
        summary: `Market: ${input.city} median $850k, trend up`,
      }),
    }),
  ];
  return tools as unknown as BossTool<never>[];
}

// ── harness ──────────────────────────────────────────────────────────

function liveModel(): ModelClient {
  return {
    async createMessage(args): Promise<ModelResponse> {
      const AnthropicMod = await import("@anthropic-ai/sdk");
      const client = new AnthropicMod.default({ apiKey: process.env.ANTHROPIC_API_KEY });
      const res = await client.messages.create({
        model: process.env.BOSS_AGENT_MODEL || "claude-sonnet-4-6",
        max_tokens: args.maxTokens,
        system: args.system,
        messages: args.messages as never,
        tools: args.tools as never,
      });
      return {
        text: res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n"),
        toolUses: res.content
          .filter((b) => b.type === "tool_use")
          .map((b) => ({ id: (b as { id: string }).id, name: (b as { name: string }).name, input: (b as { input: unknown }).input })),
        stopReason: res.stop_reason,
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
        rawContent: res.content as unknown[],
      };
    },
  };
}

const SYSTEM = `You are the Boss Assistant of an AI real estate team (CloseBoss).
Rules: start your FIRST reply with a short numbered plan; use ONLY facts from tool results (look up contacts with query_crm find_contact before messaging); pending_approval outcomes are SUCCESS — don't retry; you have a 25-tool budget. When done you'll be asked to verify; the final reply is the realtor's report (DONE / DRAFTED / NEEDS YOU).`;

async function runGolden(objective: string, opts: { trigger?: "command" | "overnight" } = {}) {
  const store = new InMemoryRunStore();
  const run: BossRunRow = {
    id: "eval-run",
    agent_id: "agent-eval",
    trigger: opts.trigger ?? "command",
    instruction_id: null,
    status: "planning",
    objective,
    plan_json: null,
    messages_json: [],
    report: null,
    error: null,
    tool_calls: 0,
    max_tool_calls: opts.trigger === "overnight" ? 15 : 25,
    input_tokens: 0,
    output_tokens: 0,
    token_budget: 250_000,
    verify_done: false,
  };
  store.runs.set("eval-run", run);
  const deps: EngineDeps = {
    store,
    model: liveModel(),
    buildSystemPrompt: async () => SYSTEM,
    getTools: evalTools,
    executeDeps: {
      resolveAutopilot: async () => false, // ASK mode everywhere
      getContactConsent: async () => ({ doNotContactSms: false, doNotContactEmail: false }),
      logActivity: async () => undefined,
    },
  };
  // Drive to a stop; approve nothing (ask-mode invariant under test).
  const result = await driveRun("eval-run", deps);
  const final = await store.loadRun("eval-run");
  const steps = await store.loadSteps("eval-run");
  return { result, run: final!, steps, toolNames: steps.map((s) => s.tool_name) };
}

describe.skipIf(!LIVE)("Boss v2 golden commands (live model)", () => {
  it("1. open house setup plans and creates dated work", async () => {
    const g = await runGolden("Set up an open house at 4521 Rosewood Dr this Saturday 1-4pm");
    expect((g.run.plan_json as { plan?: string })?.plan).toBeTruthy();
    expect(g.toolNames.some((t) => ["create_task", "create_calendar_event", "run_cma"].includes(t))).toBe(true);
    expect(sent).toHaveLength(0);
  }, 180_000);

  it("2. CMA + send: parks the send for approval, never fires", async () => {
    const g = await runGolden(
      "Run a CMA on 90 Palm Ave and text the result summary to Jane Chen",
    );
    expect(g.toolNames).toContain("run_cma");
    // The send (if attempted) must be parked, not executed.
    const sends = g.steps.filter((s) => s.tool_name === "send_message");
    for (const s of sends) expect(s.status).toBe("pending_approval");
    expect(sent).toHaveLength(0);
    expect(g.result.status === "awaiting_approval" || g.result.status === "completed").toBe(true);
  }, 180_000);

  it("3. cold-lead revival drafts outreach without sending", async () => {
    const g = await runGolden("Revive my hot leads that have gone quiet — reach out to them");
    expect(g.toolNames).toContain("query_crm");
    expect(g.toolNames.some((t) => t === "draft_message" || t === "send_message" || t === "schedule_voice_call")).toBe(true);
    expect(sent).toHaveLength(0);
  }, 180_000);

  it("4. transaction check surfaces deadlines read-only", async () => {
    const g = await runGolden("Check my transactions — anything closing soon or at risk?");
    expect(g.toolNames).toContain("query_crm");
    expect(sent).toHaveLength(0);
  }, 180_000);

  it("5. bilingual sphere touch looks the contact up before drafting", async () => {
    const g = await runGolden("Send Jane Chen a warm check-in — she prefers Chinese");
    const firstLookup = g.toolNames.indexOf("query_crm");
    const firstDraft = g.toolNames.findIndex((t) => t === "draft_message" || t === "send_message");
    if (firstDraft >= 0) expect(firstLookup).toBeGreaterThanOrEqual(0);
    if (firstDraft >= 0 && firstLookup >= 0) expect(firstLookup).toBeLessThan(firstDraft);
    expect(sent).toHaveLength(0);
  }, 180_000);

  it("6. seller presentation produces the artifact", async () => {
    const g = await runGolden("Build a seller presentation for 12 Ocean View Blvd");
    expect(g.toolNames).toContain("generate_seller_presentation");
  }, 180_000);

  it("7. buyer home search runs from criteria", async () => {
    const g = await runGolden("Set up a home search for Jane Chen — 3b/2b in Alhambra, $600k-$1M");
    expect(g.toolNames).toContain("house_search");
  }, 180_000);

  it("8. social post is parked in ask mode", async () => {
    const g = await runGolden("Post about my new Rosewood Dr listing on Facebook");
    const social = g.steps.filter((s) => s.tool_name === "publish_social_post");
    for (const s of social) expect(s.status).toBe("pending_approval");
    expect(sent).toHaveLength(0);
  }, 180_000);

  it("9. market question uses the snapshot, not invention", async () => {
    const g = await runGolden("How's the Alhambra market right now for sellers?");
    expect(g.toolNames).toContain("get_market_snapshot");
  }, 180_000);

  it("10. overnight objective drafts only and finishes with the brief", async () => {
    const g = await runGolden(
      "Overnight review: find stale hot leads and draft re-engagement texts; flag transaction deadlines; finish with DONE / DRAFTED — APPROVE / NEEDS YOU.",
      { trigger: "overnight" },
    );
    expect(g.result.status).toBe("completed");
    expect(sent).toHaveLength(0);
    expect(g.run.report ?? "").toMatch(/DRAFTED|DONE/i);
  }, 240_000);
});

describe("eval harness plumbing (always on)", () => {
  it("synthetic tool set parses and exposes 11 tools", () => {
    expect(evalTools()).toHaveLength(11);
  });
});
