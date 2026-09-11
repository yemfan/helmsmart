/**
 * Tests for the autonomy gating logic.
 *
 * We test the routing decisions in isolation by mocking the minimal Supabase
 * surface the gating module uses (just the db.from() calls for approval insert
 * and the @helm/ai-workforce functions). The real DB and real employee records
 * are not involved — we're testing the decision tree, not the infra.
 */
import { beforeEach, describe, it, expect, vi, type MockedFunction } from "vitest";

// ── Lightweight mock for @helm/ai-workforce ──────────────────────────────────

vi.mock("@helm/ai-workforce", () => ({
  getEmployee: vi.fn(),
  startRun: vi.fn().mockResolvedValue("run-123"),
  completeRun: vi.fn().mockResolvedValue(undefined),
  escalateRun: vi.fn().mockResolvedValue(undefined),
  failRun: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/notifications-service", () => ({
  createNotificationService: vi.fn().mockResolvedValue(undefined),
}));

// slack.ts transitively imports supabase/server, which can't load under vitest —
// stub the only export the gating module uses.
vi.mock("@/lib/integrations/slack", () => ({
  notifySlackApprovalPending: vi.fn().mockResolvedValue(false),
}));

vi.mock("@helm/dna-operations", () => ({
  insertTask: vi.fn().mockResolvedValue(undefined),
}));

import {
  getEmployee,
  startRun,
  escalateRun,
  failRun,
  completeRun,
} from "@helm/ai-workforce";
import { insertTask } from "@helm/dna-operations";
import { createNotificationService } from "@/lib/notifications-service";

import { enforceAutonomy } from "./workforce-gating";
import type { AiEmployee } from "@helm/ai-workforce";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEmployee(autonomy: "autonomous" | "act_with_approval" | "suggest"): AiEmployee {
  return {
    id: "emp-1",
    organizationId: "org-1",
    slug: "emma",
    name: "Emma",
    role: "AI Receptionist",
    department: "Service",
    dnaModule: "service",
    industryPack: null,
    goals: [],
    knowledgeSources: [],
    permissions: { autonomy },
    model: "claude-sonnet-4-6",
    personality: "Warm",
    status: "active",
    config: {},
  };
}

function makeDb(insertResult: { error: null | { message: string } } = { error: null }) {
  const singleFn = vi.fn().mockResolvedValue({ data: { id: "approval-1" }, error: null });
  const selectFn = vi.fn().mockReturnValue({ single: singleFn });
  const insertFn = vi.fn().mockReturnValue({
    // for callers that just await the insert (no .select chain)
    then: (resolve: (v: typeof insertResult) => unknown) => Promise.resolve(insertResult).then(resolve),
    // for callers that chain .select("id").single()
    select: selectFn,
  });
  return {
    from: vi.fn().mockReturnValue({ insert: insertFn }),
    _insertFn: insertFn,
  } as unknown as Parameters<typeof enforceAutonomy>[0];
}

const baseOpts = {
  runInput: { channel: "sms" as const, subjectType: "contact", subjectId: "client-1" },
  approvalSubject: { from: "+16265551234", bodyPreview: "I need an appointment" },
  toolKey: "service.book_appointment",
  toolInput: { from: "+16265551234" },
  description: "Emma wants to book an appointment",
};

/** Emma's drafted reply, in `reply_to_text`'s shape (see lib/ai-team/actions/outbound.ts). */
const proposal = {
  actionKey: "reply_to_text",
  params: { client_id: "client-1", message: "Tuesday at 3 or Wednesday at 10?" },
  summary: "Emma will reply to Priya Shah at (626) 555-1234",
  details: {
    kind: "text" as const,
    clientId: "client-1",
    clientName: "Priya Shah",
    phone: "(626) 555-1234",
    message: "Tuesday at 3 or Wednesday at 10?",
  },
};

type InsertSpy = { _insertFn: MockedFunction<(row: Record<string, unknown>) => unknown> };

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("enforceAutonomy", () => {
  it("returns no_employee when getEmployee returns null", async () => {
    (getEmployee as MockedFunction<typeof getEmployee>).mockResolvedValueOnce(null);
    const execute = vi.fn();
    const result = await enforceAutonomy(makeDb(), "org-1", "emma", { ...baseOpts, execute });
    expect(result.status).toBe("no_employee");
    expect(execute).not.toHaveBeenCalled();
  });

  it("returns no_employee when employee is paused", async () => {
    (getEmployee as MockedFunction<typeof getEmployee>).mockResolvedValueOnce({
      ...makeEmployee("autonomous"),
      status: "paused",
    });
    const execute = vi.fn();
    const result = await enforceAutonomy(makeDb(), "org-1", "emma", { ...baseOpts, execute });
    expect(result.status).toBe("no_employee");
    expect(execute).not.toHaveBeenCalled();
  });

  it("returns skipped without calling execute for suggest", async () => {
    (getEmployee as MockedFunction<typeof getEmployee>).mockResolvedValueOnce(makeEmployee("suggest"));
    const execute = vi.fn();
    const result = await enforceAutonomy(makeDb(), "org-1", "emma", { ...baseOpts, execute });
    expect(result.status).toBe("skipped");
    expect(execute).not.toHaveBeenCalled();
    expect(startRun).not.toHaveBeenCalled();
  });

  it("parks the drafted action itself for act_with_approval with propose — an approval the registry runs", async () => {
    (getEmployee as MockedFunction<typeof getEmployee>).mockResolvedValueOnce(makeEmployee("act_with_approval"));
    const execute = vi.fn();
    const propose = vi.fn().mockResolvedValue({ proposal, usage: { tokensUsed: 900, costCents: 2 } });
    const db = makeDb();
    const result = await enforceAutonomy(db, "org-1", "emma", { ...baseOpts, propose, execute });

    expect(result).toEqual({ status: "escalated", runId: "run-123", approvalId: "approval-1" });
    expect(propose).toHaveBeenCalledWith({ runId: "run-123", employeeName: "Emma" });
    expect(execute).not.toHaveBeenCalled();

    const inserted = (db as unknown as InsertSpy)._insertFn.mock.calls[0][0];
    expect(inserted).toMatchObject({
      organization_id: "org-1",
      employee_slug: "emma",
      action_key: "reply_to_text",
      params: proposal.params,
      summary: proposal.summary,
      details: proposal.details,
      status: "proposed",
      source: expect.objectContaining({ kind: "autonomy_gate", run_id: "run-123", subject_type: "contact", subject_id: "client-1" }),
    });
    // Drafting cost is the run's; the run waits on the approval.
    expect(escalateRun).toHaveBeenCalledWith(expect.anything(), "org-1", "run-123", expect.stringContaining("reply_to_text"), {
      tokensUsed: 900,
      costCents: 2,
      outcome: { approval_id: "approval-1" },
    });
    expect(createNotificationService).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({ titleKey: "notifications.events.employeeNeedsApproval", body: proposal.summary, link: "/home" }),
    );
  });

  it("parks nothing when there is nothing to propose, and closes the run", async () => {
    (getEmployee as MockedFunction<typeof getEmployee>).mockResolvedValueOnce(makeEmployee("act_with_approval"));
    const execute = vi.fn();
    const propose = vi.fn().mockResolvedValue({ proposal: null, usage: { tokensUsed: 400, costCents: 1 } });
    const db = makeDb();
    const result = await enforceAutonomy(db, "org-1", "emma", { ...baseOpts, propose, execute });

    expect(result).toEqual({ status: "skipped", runId: "run-123" });
    expect(db.from).not.toHaveBeenCalled();
    expect(completeRun).toHaveBeenCalledWith(expect.anything(), "org-1", "run-123", {
      status: "succeeded",
      tokensUsed: 400,
      costCents: 1,
      outcome: { proposed: false },
    });
    expect(escalateRun).not.toHaveBeenCalled();
    expect(createNotificationService).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("fails the run and parks nothing when drafting fails — and never falls back to executing", async () => {
    (getEmployee as MockedFunction<typeof getEmployee>).mockResolvedValueOnce(makeEmployee("act_with_approval"));
    const execute = vi.fn();
    const propose = vi.fn().mockRejectedValue(new Error("Anthropic timeout"));
    const db = makeDb();
    const result = await enforceAutonomy(db, "org-1", "emma", { ...baseOpts, propose, execute });

    expect(result).toEqual({ status: "skipped", runId: "run-123" });
    expect(failRun).toHaveBeenCalledWith(expect.anything(), "org-1", "run-123", "Anthropic timeout");
    expect(db.from).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("never drafts for an autonomous employee — propose is the approval path only", async () => {
    (getEmployee as MockedFunction<typeof getEmployee>).mockResolvedValueOnce(makeEmployee("autonomous"));
    const propose = vi.fn();
    const execute = vi.fn().mockResolvedValue({ value: null });
    const result = await enforceAutonomy(makeDb(), "org-1", "emma", { ...baseOpts, propose, execute });
    expect(result.status).toBe("executed");
    expect(propose).not.toHaveBeenCalled();
  });

  it("parks a manual ai_approvals row (no execute, no task) for act_with_approval without propose", async () => {
    (getEmployee as MockedFunction<typeof getEmployee>).mockResolvedValueOnce(makeEmployee("act_with_approval"));
    const execute = vi.fn();
    const db = makeDb();
    const result = await enforceAutonomy(db, "org-1", "emma", {
      ...baseOpts,
      taskNote: "drafted message",
      execute,
    });
    expect(result.status).toBe("escalated");
    expect(result.runId).toBe("run-123");
    expect(result.approvalId).toBe("approval-1");
    expect(execute).not.toHaveBeenCalled();

    // The one approvals object — the same the Ask Mark panel and /home show.
    expect(db.from).toHaveBeenCalledWith("ai_approvals");
    const inserted = (db as unknown as { _insertFn: MockedFunction<(row: Record<string, unknown>) => unknown> })._insertFn.mock.calls[0][0];
    expect(inserted).toMatchObject({
      organization_id: "org-1",
      employee_slug: "emma",
      action_key: "service.book_appointment",
      params: baseOpts.toolInput,
      summary: baseOpts.description,
      status: "proposed",
      details: { kind: "manual", note: "drafted message" },
      source: expect.objectContaining({ kind: "autonomy_gate", run_id: "run-123", subject_type: "contact", subject_id: "client-1" }),
    });
    // …and no longer a task, nor the legacy table.
    expect(insertTask).not.toHaveBeenCalled();
    expect(db.from).not.toHaveBeenCalledWith("ai_employee_approvals");

    expect(escalateRun).toHaveBeenCalledWith(expect.anything(), "org-1", "run-123", expect.any(String), {
      outcome: { approval_id: "approval-1" },
    });
    expect(createNotificationService).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({ titleKey: "notifications.events.employeeNeedsApproval", params: { employee: "Emma" }, link: "/home" }),
    );
  });

  it("calls execute and returns executed for autonomous", async () => {
    (getEmployee as MockedFunction<typeof getEmployee>).mockResolvedValueOnce(makeEmployee("autonomous"));
    (completeRun as MockedFunction<typeof completeRun>).mockResolvedValue(undefined);
    const execute = vi.fn().mockResolvedValue({ value: "booked", tokensUsed: 800, costCents: 1 });
    const result = await enforceAutonomy(makeDb(), "org-1", "emma", { ...baseOpts, execute });
    expect(result.status).toBe("executed");
    expect(result.value).toBe("booked");
    expect(execute).toHaveBeenCalledWith("run-123");
    expect(completeRun).toHaveBeenCalledWith(
      expect.anything(), "org-1", "run-123",
      expect.objectContaining({ status: "succeeded", tokensUsed: 800, costCents: 1 }),
    );
  });

  it("closes as failed (not throws) when execute throws", async () => {
    (getEmployee as MockedFunction<typeof getEmployee>).mockResolvedValueOnce(makeEmployee("autonomous"));
    (failRun as MockedFunction<typeof failRun>).mockResolvedValue(undefined);
    const execute = vi.fn().mockRejectedValue(new Error("Anthropic timeout"));
    const result = await enforceAutonomy(makeDb(), "org-1", "emma", { ...baseOpts, execute });
    expect(result.status).toBe("executed"); // attempted
    expect(failRun).toHaveBeenCalledWith(
      expect.anything(), "org-1", "run-123", "Anthropic timeout",
    );
  });
});
