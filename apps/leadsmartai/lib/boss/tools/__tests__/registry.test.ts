import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Chainable supabase stub: every builder method returns itself; terminal
// methods resolve to whatever the test primed via `prime()`.
type Primed = { data: unknown; error: unknown };
const primed: Record<string, Primed[]> = {};
function prime(table: string, result: Primed) {
  (primed[table] ??= []).push(result);
}
function makeBuilder(table: string) {
  const next = () => primed[table]?.shift() ?? { data: null, error: null };
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq", "gte", "lte", "lt", "or", "not", "ilike", "order", "limit", "insert", "update", "upsert"]) {
    b[m] = () => b;
  }
  b.maybeSingle = () => Promise.resolve(next());
  b.single = () => Promise.resolve(next());
  // awaiting the builder itself (list queries)
  (b as { then?: unknown }).then = (resolve: (v: Primed) => void) => resolve(next());
  return b;
}
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: { from: (table: string) => makeBuilder(table) },
}));

vi.mock("@/lib/cma/service", () => ({
  createCmaForAgent: vi.fn(async () => ({ ok: true, cma: { id: "cma-1" } })),
  isCreateCmaFailure: (r: { ok: boolean }) => !r.ok,
  findRecentCmaSnapshotByAddress: vi.fn(async () => null),
}));
vi.mock("@/lib/cma/aiCma", () => ({ generateAiCma: vi.fn() }));
vi.mock("@/lib/deep-report/service", () => ({ generateDeepReport: vi.fn() }));
vi.mock("@/lib/quota/featureQuota", () => ({
  getFeatureQuota: vi.fn(async () => ({ reached: false, limit: 5 })),
  incrementFeatureUsage: vi.fn(async () => undefined),
}));
vi.mock("@/lib/presentationAI", () => ({ generatePresentationAISections: vi.fn() }));
vi.mock("@/lib/presentations/loadPresentationAgent", () => ({ loadPresentationAgent: vi.fn() }));
vi.mock("@/lib/house-search/aiHouseSearch", () => ({ generateHouseSearch: vi.fn() }));
vi.mock("@/lib/house-search/savedHouseSearches", () => ({
  createSavedHouseSearch: vi.fn(),
  updateSavedHouseSearch: vi.fn(),
}));
vi.mock("@/lib/anthropic", () => ({ getAnthropicClient: vi.fn() }));
vi.mock("@/lib/drafts/sender", () => ({ dispatchApprovedDrafts: vi.fn() }));
vi.mock("@/lib/crm/pipeline/tasks", () => ({
  createTask: vi.fn(async (p: { title: string }) => ({ id: "task-1", title: p.title })),
}));
vi.mock("@/lib/leads-gen/publish", () => ({ publishPost: vi.fn() }));
vi.mock("@/lib/cityDataEngine", () => ({
  normalizeCityState: (c: string, s?: string) => ({ city: c, state: s ?? "CA" }),
}));
vi.mock("@/lib/agent-messaging/settings", () => ({
  getAgentMessageSettingsEffective: vi.fn(async () => null),
}));
vi.mock("@/lib/closeboss/autopilot", () => ({ effectiveAutopilot: vi.fn(async () => false) }));
vi.mock("@/lib/closeboss/activities", () => ({ logAssistantActivity: vi.fn(async () => undefined) }));

// eslint-disable-next-line import/first
import { getBossTool, listBossTools } from "../registry";
// eslint-disable-next-line import/first
import { executeTool, InMemoryIdempotencyStore, type ExecuteDeps } from "../execute";
// eslint-disable-next-line import/first
import { newRunState, type ToolContext } from "../types";
// eslint-disable-next-line import/first
import { dispatchApprovedDrafts } from "@/lib/drafts/sender";
// eslint-disable-next-line import/first
import { createCmaForAgent } from "@/lib/cma/service";

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
    resolveAutopilot: vi.fn(async () => false), // ask mode unless overridden
    getContactConsent: vi.fn(async () => ({ doNotContactSms: false, doNotContactEmail: false })),
    logActivity: vi.fn(async () => undefined),
    idempotency: new InMemoryIdempotencyStore(),
    ...overrides,
  };
}

describe("boss tool registry", () => {
  it("registers the full HANDOFF_BOSS_V2 PR-2 tool set (minus sequences, see registry note)", () => {
    const names = listBossTools()
      .map((t) => t.name)
      .sort();
    expect(names).toEqual(
      [
        "run_cma",
        "house_search",
        "generate_seller_presentation",
        "generate_deep_report",
        "draft_message",
        "send_message",
        "schedule_voice_call",
        "create_task",
        "create_calendar_event",
        "publish_social_post",
        "publish_post_everywhere",
        "schedule_social_post",
        "create_avatar_video",
        "import_listing_from_url",
        "create_listing_video_ad",
        "import_contacts_from_file",
        "run_skill",
        "start_selling_playbook",
        "start_buying_playbook",
        "setup_open_house",
        "coordinate_closing",
        "get_pipeline",
        "get_deals",
        "get_financials",
        "get_calendar",
        "get_sphere_signals",
        "get_performance",
        "hand_off_to_agent",
        "report_bug",
        "query_crm",
        "get_market_snapshot",
      ].sort(),
    );
  });

  it("every outbound tool declares an outbound spec; no tool is financial", () => {
    for (const tool of listBossTools()) {
      if (tool.riskClass === "outbound") {
        expect(tool.outbound, `${tool.name} must declare outbound`).toBeTruthy();
        expect(tool.propose, `${tool.name} must implement propose()`).toBeTypeOf("function");
      }
      expect(tool.riskClass).not.toBe("financial");
    }
  });

  it("ACCEPTANCE: ask-mode send_message yields a pending proposal and never dispatches", async () => {
    prime("message_drafts", {
      data: { id: "d1", status: "pending", body: "Hello Jane, following up!" },
      error: null,
    });
    const out = await executeTool(
      ctx(),
      "send_message",
      { draft_id: "5f1e6a7c-1111-4222-8333-444455556666", channel: "sms", contact_id: "5f1e6a7c-aaaa-4bbb-8ccc-ddddeeeeffff" },
      deps(),
    );
    expect(out.status).toBe("pending_approval");
    expect(dispatchApprovedDrafts).not.toHaveBeenCalled();
  });

  it("run_cma happy path (research tools run even in ask mode)", async () => {
    prime("agents", { data: { auth_user_id: "user-1" }, error: null });
    const out = await executeTool(
      ctx(),
      "run_cma",
      { address: "123 Main St, Alhambra CA" },
      deps(),
    );
    expect(out.status).toBe("completed");
    expect(createCmaForAgent).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "agent-1", subjectAddress: "123 Main St, Alhambra CA" }),
    );
    expect(out.status === "completed" && out.artifactUrl).toBe("/dashboard/cma/cma-1");
  });

  it("create_task happy path (crm_write runs in ask mode)", async () => {
    const out = await executeTool(
      ctx(),
      "create_task",
      { title: "Call the lender back", priority: "high" },
      deps(),
    );
    expect(out.status).toBe("completed");
  });

  it("schedule_voice_call in ask mode proposes without inserting a scheduled action", async () => {
    prime("contacts", { data: { id: "c-1", name: "Jane Chen" }, error: null });
    const out = await executeTool(
      ctx(),
      "schedule_voice_call",
      { contact_id: "5f1e6a7c-aaaa-4bbb-8ccc-ddddeeeeffff", objective: "Qualify on budget and timeline" },
      deps(),
    );
    expect(out.status).toBe("pending_approval");
  });

  it("getBossTool resolves by name", () => {
    expect(getBossTool("run_cma")?.name).toBe("run_cma");
    expect(getBossTool("nope")).toBeNull();
  });
});
