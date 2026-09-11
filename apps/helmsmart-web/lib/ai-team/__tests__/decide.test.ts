/**
 * `decideApprovalCore` — the only path that sends. What it must guarantee:
 * the right permission, one execution per approval however many clicks, the
 * real refusal reason on the card, no approving a stale proposal, and an org
 * check at the moment of sending.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("twilio", () => ({ default: () => ({ messages: { create: vi.fn() } }) }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(), FROM_ADDRESS: "noreply@example.com" }));
const sendSmsAsOrg = vi.hoisted(() => vi.fn());
vi.mock("@/lib/outbound-send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/outbound-send")>()),
  sendSmsAsOrg,
}));
const sendReminderForInvoice = vi.hoisted(() => vi.fn());
vi.mock("@/lib/invoice-reminders", () => ({ sendReminderForInvoice }));

import { decideApprovalCore, type DecideDeps } from "../decide";
import { sendInvoiceReminder, textClient } from "../actions/outbound";
import { fakeDb } from "./fake-db";
import { OTHER_ORG, ORG, USER, testContext } from "./context";
import { INV_1042, PRIYA, PROPOSAL, STRANGER, reminderProposal, seedTables, textProposal } from "./seed";

const OPTED_OUT = {
  ok: false,
  reason: "opted_out",
  decision: {
    allowed: false,
    channel: "sms",
    purpose: "conversation",
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

function deps(): DecideDeps & { recordRun: ReturnType<typeof vi.fn> } {
  return {
    getAction: (k) => [textClient, sendInvoiceReminder].find((a) => a.key === k) ?? null,
    recordRun: vi.fn(async () => {}),
  };
}

function setup(rows = [textProposal()]) {
  const db = fakeDb({ ...seedTables(), ai_approvals: rows as unknown as Record<string, unknown>[] });
  return { db, row: () => db.tables.ai_approvals[0] };
}

beforeEach(() => {
  sendSmsAsOrg.mockReset();
  sendReminderForInvoice.mockReset();
});

describe("approving", () => {
  it("sends the text once, as the AI team, and records Sarah's run", async () => {
    const { db, row } = setup();
    sendSmsAsOrg.mockResolvedValue({ ok: true, externalId: "SM1" });
    const d = deps();

    const res = await decideApprovalCore(testContext(db), PROPOSAL, "approve", undefined, d);

    expect(res.ok).toBe(true);
    expect(sendSmsAsOrg).toHaveBeenCalledTimes(1);
    expect(sendSmsAsOrg).toHaveBeenCalledWith(
      db,
      ORG,
      expect.objectContaining({ clientId: PRIYA, to: "+14155550143", body: "Running 10 minutes late!", sentBy: "ai_team", purpose: "conversation" }),
    );
    expect(row()).toMatchObject({ status: "executed", decided_by: USER, error: null });
    expect(row().executed_at).toEqual(expect.any(String));
    expect(d.recordRun).toHaveBeenCalledWith(
      db,
      ORG,
      "sarah",
      expect.objectContaining({ status: "succeeded", channel: "sms", subjectType: "contact", subjectId: PRIYA }),
    );
  });

  it("executes once when approved twice at the same moment", async () => {
    const { db } = setup();
    sendSmsAsOrg.mockResolvedValue({ ok: true, externalId: "SM1" });
    const d = deps();

    const [a, b] = await Promise.all([
      decideApprovalCore(testContext(db), PROPOSAL, "approve", undefined, d),
      decideApprovalCore(testContext(db), PROPOSAL, "approve", undefined, d),
    ]);

    expect(sendSmsAsOrg).toHaveBeenCalledTimes(1);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    const loser = a.ok ? b : a;
    expect(loser).toMatchObject({ ok: false, reason: "already_decided" });
  });

  it("sends the owner's edited message, trimmed, and keeps it on the row", async () => {
    const { db, row } = setup();
    sendSmsAsOrg.mockResolvedValue({ ok: true, externalId: "SM1" });
    await decideApprovalCore(testContext(db), PROPOSAL, "approve", { message: "  Running 15 minutes late — sorry!  " }, deps());
    expect(sendSmsAsOrg).toHaveBeenCalledWith(db, ORG, expect.objectContaining({ body: "Running 15 minutes late — sorry!" }));
    expect(row().details).toMatchObject({ message: "Running 15 minutes late — sorry!" });
  });

  it("refuses an empty edited message without deciding anything", async () => {
    const { db, row } = setup();
    const res = await decideApprovalCore(testContext(db), PROPOSAL, "approve", { message: "   " }, deps());
    expect(res).toMatchObject({ ok: false, reason: "invalid_edit", error: "Write a message before sending." });
    expect(row().status).toBe("proposed");
    expect(sendSmsAsOrg).not.toHaveBeenCalled();
  });

  it("puts the real refusal on the card when the client opted out", async () => {
    const { db, row } = setup();
    sendSmsAsOrg.mockResolvedValue(OPTED_OUT);
    const d = deps();

    const res = await decideApprovalCore(testContext(db), PROPOSAL, "approve", undefined, d);

    expect(res.ok).toBe(false);
    expect(!res.ok && res.reason).toBe("refused");
    expect(!res.ok && res.error).toMatch(/^Priya Shah opted out of text messages on .+ \(replied STOP\)\.$/);
    expect(row()).toMatchObject({ status: "failed" });
    expect(row().error).toMatch(/opted out/);
    expect(d.recordRun).toHaveBeenCalledWith(db, ORG, "sarah", expect.objectContaining({ status: "failed", subjectId: PRIYA }));
  });

  it("re-checks the org at the moment of sending", async () => {
    // A row whose params name another business's client — tampered, or stale.
    const { db, row } = setup([textProposal({ params: { client_id: STRANGER, message: "hi" } })]);
    const res = await decideApprovalCore(testContext(db), PROPOSAL, "approve", undefined, deps());
    expect(res).toMatchObject({ ok: false, reason: "refused", error: "That client is no longer in this business." });
    expect(sendSmsAsOrg).not.toHaveBeenCalled();
    expect(row().status).toBe("failed");
  });

  it("does not remind about an invoice that was paid in the meantime", async () => {
    const seed = seedTables();
    (seed.invoices[0] as Record<string, unknown>).status = "paid";
    const db = fakeDb({ ...seed, ai_approvals: [reminderProposal() as unknown as Record<string, unknown>] });
    const res = await decideApprovalCore(testContext(db), PROPOSAL, "approve", undefined, deps());
    expect(res).toMatchObject({ ok: false, reason: "refused", error: "INV-1042 isn't waiting on payment any more, so no reminder was sent." });
    expect(sendReminderForInvoice).not.toHaveBeenCalled();
  });

  it("sends an approved payment reminder through the reminder path, as the AI team", async () => {
    const { db, row } = setup([reminderProposal()]);
    sendReminderForInvoice.mockResolvedValue({ sent: true });
    const res = await decideApprovalCore(testContext(db), PROPOSAL, "approve", undefined, deps());
    expect(res.ok).toBe(true);
    expect(sendReminderForInvoice).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ id: INV_1042, invoice_number: "INV-1042", clients: expect.objectContaining({ email: "dana@example.com" }) }),
      { today: "2026-09-11", sentBy: "ai_team" },
    );
    expect(row().status).toBe("executed");
  });
});

describe("who may decide", () => {
  it("needs clients.write to approve a text", async () => {
    const { db, row } = setup();
    const res = await decideApprovalCore(testContext(db, { role: "bookkeeper" }), PROPOSAL, "approve", undefined, deps());
    expect(res).toMatchObject({ ok: false, reason: "forbidden", error: "Your role can't approve this. Ask the owner or an admin." });
    expect(row().status).toBe("proposed");
    expect(sendSmsAsOrg).not.toHaveBeenCalled();
  });

  it("needs invoices.write to approve a payment reminder — which a bookkeeper has", async () => {
    const { db } = setup([reminderProposal()]);
    sendReminderForInvoice.mockResolvedValue({ sent: true });
    const viewer = await decideApprovalCore(testContext(db, { role: "viewer" }), PROPOSAL, "approve", undefined, deps());
    expect(viewer).toMatchObject({ ok: false, reason: "forbidden" });
    const bookkeeper = await decideApprovalCore(testContext(db, { role: "bookkeeper" }), PROPOSAL, "approve", undefined, deps());
    expect(bookkeeper.ok).toBe(true);
    expect(sendReminderForInvoice).toHaveBeenCalledTimes(1);
  });

  it("cannot reach another business's approval", async () => {
    const { db } = setup([textProposal({ organization_id: OTHER_ORG })]);
    const res = await decideApprovalCore(testContext(db), PROPOSAL, "approve", undefined, deps());
    expect(res).toMatchObject({ ok: false, reason: "not_found" });
    expect(sendSmsAsOrg).not.toHaveBeenCalled();
  });
});

describe("the lifecycle", () => {
  it("an expired proposal can't be approved, and is closed as expired", async () => {
    const { db, row } = setup([textProposal({ created_at: "2026-09-01T00:00:00.000Z" })]);
    const res = await decideApprovalCore(testContext(db), PROPOSAL, "approve", undefined, deps());
    expect(res).toMatchObject({ ok: false, reason: "expired" });
    expect(row().status).toBe("expired");
    expect(sendSmsAsOrg).not.toHaveBeenCalled();
  });

  it("declining records who declined and sends nothing", async () => {
    const { db, row } = setup();
    const res = await decideApprovalCore(testContext(db), PROPOSAL, "decline", undefined, deps());
    expect(res.ok).toBe(true);
    expect(row()).toMatchObject({ status: "declined", decided_by: USER });
    expect(sendSmsAsOrg).not.toHaveBeenCalled();
  });

  it("a decided proposal can't be approved afterwards", async () => {
    const { db } = setup([textProposal({ status: "declined" })]);
    const res = await decideApprovalCore(testContext(db), PROPOSAL, "approve", undefined, deps());
    expect(res).toMatchObject({ ok: false, reason: "already_decided" });
    expect(sendSmsAsOrg).not.toHaveBeenCalled();
  });

  it("a proposal nothing can run (an autonomy-gated employee's) is marked done by the owner", async () => {
    const { db, row } = setup([
      textProposal({
        employee_slug: "emma",
        action_key: "service.book_appointment",
        params: { from: "+14155550143" },
        details: { kind: "manual", note: "Wants Tuesday" },
      }),
    ]);
    const viewer = await decideApprovalCore(testContext(db, { role: "viewer" }), PROPOSAL, "approve", undefined, deps());
    expect(viewer).toMatchObject({ ok: false, reason: "forbidden" });
    const owner = await decideApprovalCore(testContext(db), PROPOSAL, "approve", undefined, deps());
    expect(owner.ok).toBe(true);
    expect(row().status).toBe("approved");
    expect(sendSmsAsOrg).not.toHaveBeenCalled();
  });
});
