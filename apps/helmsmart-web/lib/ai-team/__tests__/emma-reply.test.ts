/**
 * Emma's replies when she needs approval — from her autonomy gate to the
 * owner's Approve, over the real registry and the real `decideApprovalCore`.
 *
 * What must hold: the gate parks an approval the registry can run (Approve
 * and an editable message, not "Mark done"); approving sends through
 * outbound-send exactly once, as the receptionist; a consent refusal is the
 * card's reason; a proposal that changed after it was shown is refused; Mark
 * can't reach the action; and rows parked before this — the manual
 * `service.book_appointment` shape — still work as "Mark done / Decline".
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi, type MockedFunction } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("twilio", () => ({ default: () => ({ messages: { create: vi.fn() } }) }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(), FROM_ADDRESS: "noreply@example.com" }));
vi.mock("@/lib/invoice-reminders", () => ({ sendReminderForInvoice: vi.fn() }));
const sendSmsAsOrg = vi.hoisted(() => vi.fn());
vi.mock("@/lib/outbound-send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/outbound-send")>()),
  sendSmsAsOrg,
}));
vi.mock("@helm/ai-workforce", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@helm/ai-workforce")>()),
  getEmployee: vi.fn(),
  startRun: vi.fn(async () => "run-1"),
  escalateRun: vi.fn(async () => {}),
  completeRun: vi.fn(async () => {}),
  failRun: vi.fn(async () => {}),
}));
vi.mock("@/lib/notifications-service", () => ({ createNotificationService: vi.fn(async () => {}) }));
vi.mock("@/lib/integrations/slack", () => ({ notifySlackApprovalPending: vi.fn(async () => false) }));

import { getEmployee, type AiEmployee } from "@helm/ai-workforce";
import { enforceAutonomy } from "@/lib/workforce-gating";
import { receptionistReplyProposal, replyToText } from "../actions/outbound";
import { decideApprovalCore, dismissUnconfirmedCore, type DecideDeps, type DecideInput } from "../decide";
import { defaultRunDeps, getAction } from "../registry";
import { runAction } from "../run-action";
import { listUnconfirmedApprovals } from "../approvals";
import { pickDetails, toApprovalView, type ApprovalRow } from "../approval-view";
import { approvalFingerprint } from "../fingerprint.server";
import { fakeDb, type FakeDb } from "./fake-db";
import { ORG, USER, testContext } from "./context";
import { DANA, PRIYA, PROPOSAL, STRANGER, seedTables, textProposal } from "./seed";

const DRAFT = "Hi Priya! I have Tuesday at 3pm or Wednesday at 10am open — which works?";
const CREATED = "2026-09-11T16:00:00.000Z";

const OPTED_OUT = {
  ok: false,
  reason: "opted_out",
  decision: {
    allowed: false,
    channel: "sms",
    purpose: "automated",
    source: "sms_unsubscribe",
    via: "stop_reply",
    since: "2026-09-03T15:00:00.000Z",
  },
  consent: {
    client: { id: PRIYA, first_name: "Priya", last_name: "Shah", phone: "+14155550143", email: null },
    phone: "+14155550143",
    email: null,
    inputs: {},
  },
};

function emma(autonomy: "autonomous" | "act_with_approval" | "suggest"): AiEmployee {
  return {
    id: "emp-emma",
    organizationId: ORG,
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

/** Production's decide wiring, with the run recorder spied on. */
function deps(): DecideDeps & { recordRun: ReturnType<typeof vi.fn> } {
  return { getAction, recordRun: vi.fn(async () => {}) };
}

/**
 * An inbound text reaches Emma, who needs approval: the gate drafts (here,
 * `message`) and parks it the way the Twilio route does.
 */
async function gate(db: FakeDb, { message = DRAFT, clientId = PRIYA }: { message?: string; clientId?: string } = {}) {
  (getEmployee as MockedFunction<typeof getEmployee>).mockResolvedValueOnce(emma("act_with_approval"));
  const execute = vi.fn();
  const result = await enforceAutonomy(db as unknown as SupabaseClient, ORG, "emma", {
    runInput: { channel: "sms", subjectType: "contact", subjectId: clientId },
    approvalSubject: { from: "+14155550143" },
    toolKey: "service.book_appointment",
    toolInput: { from: "+14155550143" },
    description: "Emma wants to qualify and book an appointment for +14155550143 over SMS.",
    propose: async ({ employeeName }) => ({
      proposal: await receptionistReplyProposal(db as unknown as SupabaseClient, ORG, { clientId, message, employeeName }),
      usage: { tokensUsed: 1200, costCents: 1 },
    }),
    execute,
  });
  expect(execute).not.toHaveBeenCalled();
  const row = db.tables.ai_approvals[0] as unknown as ApprovalRow | undefined;
  // A fixed moment, an hour before the test context's "now".
  if (row) row.created_at = CREATED;
  return { result, row: () => db.tables.ai_approvals[0] as unknown as ApprovalRow };
}

/** Approve as the card does: the fingerprint of what it rendered, with the message as the owner left it. */
function asShown(card: ApprovalRow, message?: string): DecideInput {
  const d = pickDetails(card.details);
  return {
    edits: message !== undefined ? { message } : undefined,
    fingerprint: approvalFingerprint(card.action_key, { ...d, message: message ?? d.message }),
  };
}

beforeEach(() => {
  sendSmsAsOrg.mockReset();
});

describe("Emma's gated reply", () => {
  it("becomes an approval the registry runs — Approve and an editable message, not Mark done", async () => {
    const db = fakeDb(seedTables());
    const { result, row } = await gate(db);

    expect(result.status).toBe("escalated");
    expect(row()).toMatchObject({
      employee_slug: "emma",
      action_key: "reply_to_text",
      params: { client_id: PRIYA, message: DRAFT },
      summary: "Emma will reply to Priya Shah at (415) 555-0143",
      details: { kind: "text", clientId: PRIYA, clientName: "Priya Shah", phone: "(415) 555-0143", message: DRAFT },
      status: "proposed",
    });

    const ctx = testContext(db);
    expect(toApprovalView(row(), ctx.team, ctx.now)).toMatchObject({
      status: "proposed",
      executable: true,
      editable: true,
      employee: { slug: "emma", name: "Emma" },
    });

    // What was parked is exactly what the action's preview produces now.
    const preview = await replyToText.preview!(row().params as { client_id: string; message: string }, ctx);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(approvalFingerprint("reply_to_text", pickDetails(preview.details))).toBe(
      approvalFingerprint("reply_to_text", pickDetails(row().details)),
    );
  });

  it("approving sends it through outbound-send exactly once, as the receptionist, and records Emma's run", async () => {
    const db = fakeDb(seedTables());
    const { row } = await gate(db);
    const card = structuredClone(row());
    sendSmsAsOrg.mockResolvedValue({ ok: true, externalId: "SM1" });
    const d = deps();

    // Two clicks, two tabs: exactly one of them sends.
    const [a, b] = await Promise.all([
      decideApprovalCore(testContext(db), card.id, "approve", asShown(card), d),
      decideApprovalCore(testContext(db), card.id, "approve", asShown(card), d),
    ]);

    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect(sendSmsAsOrg).toHaveBeenCalledTimes(1);
    expect(sendSmsAsOrg).toHaveBeenCalledWith(db, ORG, {
      clientId: PRIYA,
      to: "+14155550143",
      body: DRAFT,
      sentBy: "receptionist",
      purpose: "automated",
      intent: "approved_reply",
    });
    expect(row()).toMatchObject({ status: "executed", decided_by: USER, error: null });
    expect(d.recordRun).toHaveBeenCalledTimes(1);
    expect(d.recordRun).toHaveBeenCalledWith(
      db,
      ORG,
      "emma",
      expect.objectContaining({
        status: "succeeded",
        channel: "sms",
        subjectType: "contact",
        subjectId: PRIYA,
        outcome: expect.objectContaining({ action: "reply_to_text", approval_id: card.id, approved_by: USER }),
      }),
    );
  });

  it("sends the owner's edited message, and keeps it on the row", async () => {
    const db = fakeDb(seedTables());
    const { row } = await gate(db);
    sendSmsAsOrg.mockResolvedValue({ ok: true, externalId: "SM1" });

    const res = await decideApprovalCore(testContext(db), row().id, "approve", asShown(row(), "Tuesday at 3pm works — see you then!"), deps());

    expect(res.ok).toBe(true);
    expect(sendSmsAsOrg).toHaveBeenCalledWith(db, ORG, expect.objectContaining({ body: "Tuesday at 3pm works — see you then!" }));
    expect(row().details).toMatchObject({ message: "Tuesday at 3pm works — see you then!" });
  });

  it("puts the real reason on the card when the send is refused as an opt-out", async () => {
    const db = fakeDb(seedTables());
    const { row } = await gate(db);
    sendSmsAsOrg.mockResolvedValue(OPTED_OUT);
    const d = deps();

    const res = await decideApprovalCore(testContext(db), row().id, "approve", asShown(row()), d);

    expect(res).toMatchObject({ ok: false, reason: "refused" });
    expect(!res.ok && res.error).toMatch(/^Priya Shah opted out of text messages on .+ \(replied STOP\)\.$/);
    expect(row()).toMatchObject({ status: "failed" });
    expect(row().error).toMatch(/opted out/);
    expect(d.recordRun).toHaveBeenCalledWith(db, ORG, "emma", expect.objectContaining({ status: "failed", subjectId: PRIYA }));
  });

  it("closes it without sending when the customer opted out after Emma drafted it", async () => {
    const db = fakeDb(seedTables());
    const { row } = await gate(db);
    db.tables.sms_unsubscribes.push({
      organization_id: ORG,
      phone_number: "+14155550143",
      unsubscribed_at: "2026-09-11T16:30:00.000Z",
      reason: "stop_keyword",
    });

    const res = await decideApprovalCore(testContext(db), row().id, "approve", asShown(row()), deps());

    expect(res).toMatchObject({ ok: false, reason: "refused" });
    expect(!res.ok && res.error).toMatch(/^Priya Shah opted out of text messages/);
    expect(row().status).toBe("failed");
    expect(sendSmsAsOrg).not.toHaveBeenCalled();
  });

  it("refuses, sending nothing, when the recipient was changed after the card was shown", async () => {
    const db = fakeDb(seedTables());
    const { row } = await gate(db);
    const card = structuredClone(row());
    // Any member can update a proposed row (RLS).
    row().params = { client_id: DANA, message: DRAFT };

    const res = await decideApprovalCore(testContext(db), card.id, "approve", asShown(card), deps());

    expect(res).toMatchObject({ ok: false, reason: "changed" });
    expect(row().status).toBe("proposed");
    expect(sendSmsAsOrg).not.toHaveBeenCalled();
  });

  it("needs clients.write to approve or decline it", async () => {
    const db = fakeDb(seedTables());
    const { row } = await gate(db);
    for (const decision of ["approve", "decline"] as const) {
      const res = await decideApprovalCore(testContext(db, { role: "bookkeeper" }), row().id, decision, asShown(row()), deps());
      expect(res).toMatchObject({ ok: false, reason: "forbidden" });
    }
    expect(row().status).toBe("proposed");
    expect(sendSmsAsOrg).not.toHaveBeenCalled();
  });

  it("parks nothing for someone who isn't this business's client", async () => {
    const db = fakeDb(seedTables());
    const { result } = await gate(db, { clientId: STRANGER });
    expect(result.status).toBe("skipped");
    expect(db.tables.ai_approvals).toHaveLength(0);
  });

  it("parks nothing for an empty draft", async () => {
    const db = fakeDb(seedTables());
    const { result } = await gate(db, { message: "   " });
    expect(result.status).toBe("skipped");
    expect(db.tables.ai_approvals).toHaveLength(0);
  });

  it("is out of Mark's reach — only her gate proposes it", async () => {
    const db = fakeDb(seedTables());
    const res = await runAction(testContext(db), "reply_to_text", { client_id: PRIYA, message: "hi" }, defaultRunDeps);
    expect(res).toMatchObject({ status: "failed" });
    expect(res.status === "failed" && res.error).toMatch(/no tool named "reply_to_text"/);
    expect(db.tables.ai_approvals).toHaveLength(0);
  });

  it("a reply that never reported back is unconfirmed — Dismiss only, never re-sent", async () => {
    const db = fakeDb(seedTables());
    const { row } = await gate(db);
    Object.assign(row(), { status: "approved", decided_at: "2026-09-11T16:30:00.000Z", decided_by: USER });
    const ctx = testContext(db);

    expect(toApprovalView(row(), ctx.team, ctx.now).status).toBe("unconfirmed");
    expect((await listUnconfirmedApprovals(db as never, ORG, ctx.now)).map((r) => r.id)).toEqual([row().id]);
    const again = await decideApprovalCore(ctx, row().id, "approve", asShown(row()), deps());
    expect(again).toMatchObject({ ok: false, reason: "already_decided" });
    const dismissed = await dismissUnconfirmedCore(ctx, row().id, deps());
    expect(dismissed.ok).toBe(true);
    expect(sendSmsAsOrg).not.toHaveBeenCalled();
  });
});

describe("Emma's rows from before replies were executable", () => {
  // What the gate parked until now: her tool's key and input, and no draft.
  const oldRow = () =>
    textProposal({
      employee_slug: "emma",
      action_key: "service.book_appointment",
      params: { from: "+14155550143", orgId: ORG },
      summary: "Emma wants to qualify and book an appointment for +14155550143 over SMS.",
      details: { kind: "manual", note: null },
    });

  it("still show as a manual card — Mark done / Decline, nothing to send", () => {
    const ctx = testContext(fakeDb(seedTables()));
    expect(toApprovalView(oldRow(), ctx.team, ctx.now)).toMatchObject({ executable: false, editable: false, status: "proposed" });
  });

  it("are marked done or declined by the owner, and never send", async () => {
    const done = fakeDb({ ...seedTables(), ai_approvals: [oldRow() as unknown as Record<string, unknown>] });
    const markDone = await decideApprovalCore(testContext(done), PROPOSAL, "approve", undefined, deps());
    expect(markDone.ok).toBe(true);
    expect(done.tables.ai_approvals[0]).toMatchObject({ status: "approved", decided_by: USER });

    const declined = fakeDb({ ...seedTables(), ai_approvals: [oldRow() as unknown as Record<string, unknown>] });
    const decline = await decideApprovalCore(testContext(declined), PROPOSAL, "decline", undefined, deps());
    expect(decline.ok).toBe(true);
    expect(declined.tables.ai_approvals[0]).toMatchObject({ status: "declined" });

    expect(sendSmsAsOrg).not.toHaveBeenCalled();
  });
});
