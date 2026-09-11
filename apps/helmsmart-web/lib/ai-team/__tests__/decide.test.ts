/**
 * `decideApprovalCore` — the only path that sends. What it must guarantee:
 * the right permission, one execution per approval however many clicks, the
 * real refusal reason on the card, no approving a stale proposal, an org
 * check at the moment of sending, sending exactly what the card showed — and
 * never re-sending an approval that didn't report back.
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

import { decideApprovalCore, dismissUnconfirmedCore, type DecideDeps, type DecideInput } from "../decide";
import { sendInvoiceReminder, textClient } from "../actions/outbound";
import { listUnconfirmedApprovals } from "../approvals";
import { approvalFingerprint, pickDetails, toApprovalView, type ApprovalRow } from "../approval-view";
import { fakeDb } from "./fake-db";
import { OTHER_ORG, ORG, USER, testContext } from "./context";
import { DANA, INV_1042, PRIYA, PROPOSAL, STRANGER, reminderProposal, seedTables, textProposal } from "./seed";

const CHANGED = "This proposal changed after it was shown to you, so nothing was sent. Ask Mark again.";

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

function setup(rows: ApprovalRow[] = [textProposal()], seed = seedTables()) {
  const db = fakeDb({ ...seed, ai_approvals: rows as unknown as Record<string, unknown>[] });
  return { db, row: () => db.tables.ai_approvals[0] };
}

/**
 * Approve as the card does: with the fingerprint of the details it rendered
 * from `card`, and the message as the owner left it (`message`, when edited).
 */
function asShown(card: ApprovalRow, message?: string): DecideInput {
  const d = pickDetails(card.details);
  return {
    edits: message !== undefined ? { message } : undefined,
    fingerprint: approvalFingerprint(card.action_key, { ...d, message: message ?? d.message }),
  };
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

    const res = await decideApprovalCore(testContext(db), PROPOSAL, "approve", asShown(textProposal()), d);

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
      decideApprovalCore(testContext(db), PROPOSAL, "approve", asShown(textProposal()), d),
      decideApprovalCore(testContext(db), PROPOSAL, "approve", asShown(textProposal()), d),
    ]);

    expect(sendSmsAsOrg).toHaveBeenCalledTimes(1);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    const loser = a.ok ? b : a;
    expect(loser).toMatchObject({ ok: false, reason: "already_decided" });
  });

  it("sends the owner's edited message, trimmed, and keeps it on the row", async () => {
    const { db, row } = setup();
    sendSmsAsOrg.mockResolvedValue({ ok: true, externalId: "SM1" });
    await decideApprovalCore(testContext(db), PROPOSAL, "approve", asShown(textProposal(), "  Running 15 minutes late — sorry!  "), deps());
    expect(sendSmsAsOrg).toHaveBeenCalledWith(db, ORG, expect.objectContaining({ body: "Running 15 minutes late — sorry!" }));
    expect(row().details).toMatchObject({ message: "Running 15 minutes late — sorry!" });
  });

  it("refuses an empty edited message without deciding anything", async () => {
    const { db, row } = setup();
    const res = await decideApprovalCore(testContext(db), PROPOSAL, "approve", asShown(textProposal(), "   "), deps());
    expect(res).toMatchObject({ ok: false, reason: "invalid_edit", error: "Write a message before sending." });
    expect(row().status).toBe("proposed");
    expect(sendSmsAsOrg).not.toHaveBeenCalled();
  });

  it("puts the real refusal on the card when the client opted out", async () => {
    const { db, row } = setup();
    sendSmsAsOrg.mockResolvedValue(OPTED_OUT);
    const d = deps();

    const res = await decideApprovalCore(testContext(db), PROPOSAL, "approve", asShown(textProposal()), d);

    expect(res.ok).toBe(false);
    expect(!res.ok && res.reason).toBe("refused");
    expect(!res.ok && res.error).toMatch(/^Priya Shah opted out of text messages on .+ \(replied STOP\)\.$/);
    expect(row()).toMatchObject({ status: "failed" });
    expect(row().error).toMatch(/opted out/);
    expect(d.recordRun).toHaveBeenCalledWith(db, ORG, "sarah", expect.objectContaining({ status: "failed", subjectId: PRIYA }));
  });

  it("re-checks the org at the moment of approving — another business's client is refused, nothing sent", async () => {
    // A row whose params name another business's client — tampered, or stale.
    const card = textProposal();
    const { db, row } = setup([textProposal({ params: { client_id: STRANGER, message: "hi" } })]);
    const res = await decideApprovalCore(testContext(db), PROPOSAL, "approve", asShown(card), deps());
    expect(res).toMatchObject({ ok: false, reason: "refused", error: "That client is no longer in this business." });
    expect(sendSmsAsOrg).not.toHaveBeenCalled();
    expect(row().status).toBe("failed");
  });

  it("does not remind about an invoice that was paid in the meantime", async () => {
    const seed = seedTables();
    (seed.invoices[0] as Record<string, unknown>).status = "paid";
    const { db, row } = setup([reminderProposal()], seed);
    const res = await decideApprovalCore(testContext(db), PROPOSAL, "approve", asShown(reminderProposal()), deps());
    expect(res).toMatchObject({ ok: false, reason: "refused", error: "INV-1042 isn't waiting on payment any more, so no reminder was sent." });
    expect(row().status).toBe("failed");
    expect(sendReminderForInvoice).not.toHaveBeenCalled();
  });

  it("sends an approved payment reminder through the reminder path, as the AI team", async () => {
    const { db, row } = setup([reminderProposal()]);
    sendReminderForInvoice.mockResolvedValue({ sent: true });
    const res = await decideApprovalCore(testContext(db), PROPOSAL, "approve", asShown(reminderProposal()), deps());
    expect(res.ok).toBe(true);
    expect(sendReminderForInvoice).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ id: INV_1042, invoice_number: "INV-1042", clients: expect.objectContaining({ email: "dana@example.com" }) }),
      { today: "2026-09-11", sentBy: "ai_team" },
    );
    expect(row().status).toBe("executed");
  });
});

describe("approving exactly what was shown", () => {
  it("refuses when params.client_id was changed after the card was shown", async () => {
    const card = textProposal();
    const { db, row } = setup([card]);
    // Another member edits the row directly (RLS lets any member update a proposed row).
    row().params = { client_id: DANA, message: "Running 10 minutes late!" };

    const res = await decideApprovalCore(testContext(db), PROPOSAL, "approve", asShown(card), deps());

    expect(res).toMatchObject({ ok: false, reason: "changed", error: CHANGED });
    expect(row().status).toBe("proposed");
    expect(sendSmsAsOrg).not.toHaveBeenCalled();
  });

  it("refuses even when params AND details were rewritten to agree after the card was shown", async () => {
    const card = textProposal();
    const { db, row } = setup([card]);
    row().params = { client_id: DANA, message: "Running 10 minutes late!" };
    row().details = { kind: "text", clientId: DANA, clientName: "Dana Lee", phone: "(415) 555-0101", message: "Running 10 minutes late!" };

    const res = await decideApprovalCore(testContext(db), PROPOSAL, "approve", asShown(card), deps());

    expect(res).toMatchObject({ ok: false, reason: "changed" });
    expect(row().status).toBe("proposed");
    expect(sendSmsAsOrg).not.toHaveBeenCalled();
  });

  it("refuses when the row's details no longer match its params, whatever the card sends", async () => {
    // Tampered before it was rendered: the card shows Priya (details), the params say Dana.
    // Even a fingerprint of what WOULD be sent is refused — the row itself disagrees.
    const { db, row } = setup([textProposal({ params: { client_id: DANA, message: "Running 10 minutes late!" } })]);
    const whatWouldGo = approvalFingerprint("text_client", {
      clientId: DANA,
      phone: "(415) 555-0101",
      message: "Running 10 minutes late!",
    });

    const res = await decideApprovalCore(testContext(db), PROPOSAL, "approve", { fingerprint: whatWouldGo }, deps());

    expect(res).toMatchObject({ ok: false, reason: "changed" });
    expect(row().status).toBe("proposed");
    expect(sendSmsAsOrg).not.toHaveBeenCalled();
  });

  it("refuses a payment reminder whose invoice was swapped for another", async () => {
    const seed = seedTables();
    const INV_1043 = "bbbbbbbb-0000-4000-8000-000000001043";
    seed.invoices.push({
      id: INV_1043,
      organization_id: ORG,
      invoice_number: "INV-1043",
      total: 5000,
      due_date: "2026-08-30",
      status: "overdue",
      client_id: DANA,
      reminder_count: 0,
      last_reminder_sent_at: null,
    });
    const card = reminderProposal();
    const { db, row } = setup([card], seed);
    row().params = { invoice_id: INV_1043 };

    const res = await decideApprovalCore(testContext(db), PROPOSAL, "approve", asShown(card), deps());

    expect(res).toMatchObject({ ok: false, reason: "changed", error: CHANGED });
    expect(row().status).toBe("proposed");
    expect(sendReminderForInvoice).not.toHaveBeenCalled();
  });

  it("refuses a payment reminder whose amount changed since it was shown", async () => {
    const seed = seedTables();
    (seed.invoices[0] as Record<string, unknown>).total = 1450;
    const { db, row } = setup([reminderProposal()], seed);

    const res = await decideApprovalCore(testContext(db), PROPOSAL, "approve", asShown(reminderProposal()), deps());

    expect(res).toMatchObject({ ok: false, reason: "changed" });
    expect(row().status).toBe("proposed");
    expect(sendReminderForInvoice).not.toHaveBeenCalled();
  });

  it("refuses a text when the client's phone changed since it was proposed (stale)", async () => {
    const seed = seedTables();
    (seed.clients[1] as Record<string, unknown>).phone = "+14155550999";
    const { db, row } = setup([textProposal()], seed);

    const res = await decideApprovalCore(testContext(db), PROPOSAL, "approve", asShown(textProposal()), deps());

    expect(res).toMatchObject({ ok: false, reason: "changed", error: CHANGED });
    expect(row().status).toBe("proposed");
    expect(sendSmsAsOrg).not.toHaveBeenCalled();
  });

  it("refuses a reminder when the client's email changed since it was proposed (stale)", async () => {
    const seed = seedTables();
    (seed.clients[0] as Record<string, unknown>).email = "someone-else@example.com";
    const { db } = setup([reminderProposal()], seed);
    const res = await decideApprovalCore(testContext(db), PROPOSAL, "approve", asShown(reminderProposal()), deps());
    expect(res).toMatchObject({ ok: false, reason: "changed" });
    expect(sendReminderForInvoice).not.toHaveBeenCalled();
  });

  it("refuses without a fingerprint of what was shown", async () => {
    const { db, row } = setup();
    const res = await decideApprovalCore(testContext(db), PROPOSAL, "approve", undefined, deps());
    expect(res).toMatchObject({ ok: false, reason: "changed" });
    expect(row().status).toBe("proposed");
    expect(sendSmsAsOrg).not.toHaveBeenCalled();
  });

  it("refuses when the message sent is not the message the owner confirmed", async () => {
    const { db } = setup();
    const confirmed = asShown(textProposal(), "See you at 3");
    const res = await decideApprovalCore(
      testContext(db),
      PROPOSAL,
      "approve",
      { ...confirmed, edits: { message: "Send me your card number" } },
      deps(),
    );
    expect(res).toMatchObject({ ok: false, reason: "changed" });
    expect(sendSmsAsOrg).not.toHaveBeenCalled();
  });
});

describe("who may decide", () => {
  it("needs clients.write to approve a text", async () => {
    const { db, row } = setup();
    const res = await decideApprovalCore(testContext(db, { role: "bookkeeper" }), PROPOSAL, "approve", asShown(textProposal()), deps());
    expect(res).toMatchObject({ ok: false, reason: "forbidden", error: "Your role can't approve this. Ask the owner or an admin." });
    expect(row().status).toBe("proposed");
    expect(sendSmsAsOrg).not.toHaveBeenCalled();
  });

  it("needs invoices.write to approve a payment reminder — which a bookkeeper has", async () => {
    const { db } = setup([reminderProposal()]);
    sendReminderForInvoice.mockResolvedValue({ sent: true });
    const viewer = await decideApprovalCore(testContext(db, { role: "viewer" }), PROPOSAL, "approve", asShown(reminderProposal()), deps());
    expect(viewer).toMatchObject({ ok: false, reason: "forbidden" });
    const bookkeeper = await decideApprovalCore(testContext(db, { role: "bookkeeper" }), PROPOSAL, "approve", asShown(reminderProposal()), deps());
    expect(bookkeeper.ok).toBe(true);
    expect(sendReminderForInvoice).toHaveBeenCalledTimes(1);
  });

  it("needs the same permission to decline as to approve", async () => {
    const text = setup();
    const noText = await decideApprovalCore(testContext(text.db, { role: "bookkeeper" }), PROPOSAL, "decline", undefined, deps());
    expect(noText).toMatchObject({ ok: false, reason: "forbidden" });
    expect(text.row().status).toBe("proposed");

    const reminder = setup([reminderProposal()]);
    const viewer = await decideApprovalCore(testContext(reminder.db, { role: "viewer" }), PROPOSAL, "decline", undefined, deps());
    expect(viewer).toMatchObject({ ok: false, reason: "forbidden" });
    expect(reminder.row().status).toBe("proposed");
    const bookkeeper = await decideApprovalCore(testContext(reminder.db, { role: "bookkeeper" }), PROPOSAL, "decline", undefined, deps());
    expect(bookkeeper.ok).toBe(true);
    expect(reminder.row().status).toBe("declined");
  });

  it("cannot reach another business's approval", async () => {
    const { db } = setup([textProposal({ organization_id: OTHER_ORG })]);
    const res = await decideApprovalCore(testContext(db), PROPOSAL, "approve", asShown(textProposal()), deps());
    expect(res).toMatchObject({ ok: false, reason: "not_found" });
    expect(sendSmsAsOrg).not.toHaveBeenCalled();
  });
});

describe("the lifecycle", () => {
  it("an expired proposal can't be approved, and is closed as expired", async () => {
    const { db, row } = setup([textProposal({ created_at: "2026-09-01T00:00:00.000Z" })]);
    const res = await decideApprovalCore(testContext(db), PROPOSAL, "approve", asShown(textProposal()), deps());
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
    const res = await decideApprovalCore(testContext(db), PROPOSAL, "approve", asShown(textProposal()), deps());
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

describe("an approval that never reported back", () => {
  // Approved 30 minutes before "now" (17:00), no outcome recorded: the server died mid-send.
  const stranded = (over: Partial<ApprovalRow> = {}) =>
    textProposal({ status: "approved", decided_at: "2026-09-11T16:30:00.000Z", decided_by: USER, ...over });

  it("is never re-sent — approving it again is refused", async () => {
    const { db, row } = setup([stranded()]);
    const res = await decideApprovalCore(testContext(db), PROPOSAL, "approve", asShown(textProposal()), deps());
    expect(res).toMatchObject({ ok: false, reason: "already_decided" });
    expect(row().status).toBe("approved");
    expect(sendSmsAsOrg).not.toHaveBeenCalled();
  });

  it("can be dismissed: closed as failed with a reason that says it may have gone, nothing sent", async () => {
    const { db, row } = setup([stranded()]);
    const res = await dismissUnconfirmedCore(testContext(db), PROPOSAL, deps());
    expect(res.ok).toBe(true);
    expect(row()).toMatchObject({
      status: "failed",
      error: "Dismissed without confirming it was sent. Check the conversation before asking Mark again.",
      result: { status: "unconfirmed", dismissed_by: USER },
      executed_at: null,
    });
    expect(toApprovalView(row() as unknown as ApprovalRow, {}, testContext(db).now)).toMatchObject({ status: "failed", dismissed: true });
    expect(sendSmsAsOrg).not.toHaveBeenCalled();
  });

  it("can't be dismissed while it may still be sending", async () => {
    const { db, row } = setup([stranded({ decided_at: "2026-09-11T16:55:00.000Z" })]);
    const res = await dismissUnconfirmedCore(testContext(db), PROPOSAL, deps());
    expect(res).toMatchObject({ ok: false, reason: "in_flight", error: "This is still being sent. Check back in a few minutes." });
    expect(row().status).toBe("approved");
  });

  it("has nothing to dismiss once it finished", async () => {
    for (const over of [{ status: "executed", executed_at: "2026-09-11T16:30:04.000Z" }, { status: "proposed", decided_at: null }]) {
      const { db, row } = setup([stranded(over)]);
      const res = await dismissUnconfirmedCore(testContext(db), PROPOSAL, deps());
      expect(res, JSON.stringify(over)).toMatchObject({ ok: false, reason: "nothing_to_dismiss" });
      expect(row().status).toBe(over.status);
    }
  });

  it("needs the action's permission to dismiss, and stays inside the caller's business", async () => {
    const own = setup([stranded()]);
    const bookkeeper = await dismissUnconfirmedCore(testContext(own.db, { role: "bookkeeper" }), PROPOSAL, deps());
    expect(bookkeeper).toMatchObject({ ok: false, reason: "forbidden" });
    expect(own.row().status).toBe("approved");

    const other = setup([stranded({ organization_id: OTHER_ORG })]);
    const res = await dismissUnconfirmedCore(testContext(other.db), PROPOSAL, deps());
    expect(res).toMatchObject({ ok: false, reason: "not_found" });
    expect(other.row().status).toBe("approved");
  });

  it("a send that outlives its dismissal doesn't overwrite it, and says so in the log", async () => {
    const { db, row } = setup();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    sendSmsAsOrg.mockImplementation(async () => {
      // While the send hangs, the owner dismisses it from /home.
      Object.assign(row(), { status: "failed", error: "Dismissed…", result: { status: "unconfirmed" } });
      return { ok: true, externalId: "SM1" };
    });

    const res = await decideApprovalCore(testContext(db), PROPOSAL, "approve", asShown(textProposal()), deps());

    expect(res.ok).toBe(true);
    expect(row()).toMatchObject({ status: "failed", result: { status: "unconfirmed" } });
    expect(logged).toHaveBeenCalledWith(expect.stringMatching(/outcome not recorded/));
    logged.mockRestore();
  });

  it("the /home list carries only the ones that didn't finish, in this business", async () => {
    const id = (n: number) => `cccccccc-0000-4000-8000-00000000010${n}`;
    const { db } = setup([
      stranded({ id: id(1) }),
      stranded({ id: id(2), decided_at: "2026-09-11T16:55:00.000Z" }), // may still be sending
      stranded({ id: id(3), status: "executed", executed_at: "2026-09-11T16:30:03.000Z" }),
      stranded({ id: id(4), status: "failed", error: "Priya opted out." }),
      stranded({ id: id(5), action_key: "service.book_appointment" }), // manual: approved is done
      stranded({ id: id(6), organization_id: OTHER_ORG }),
      reminderProposal({ id: id(7), status: "approved", decided_at: "2026-09-11T15:00:00.000Z" }),
    ]);
    const rows = await listUnconfirmedApprovals(db as never, ORG, testContext(db).now);
    expect(rows.map((r) => r.id)).toEqual([id(1), id(7)]);
  });
});
