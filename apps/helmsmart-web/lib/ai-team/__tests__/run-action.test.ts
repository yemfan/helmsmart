/**
 * The runner's rules — the ones that must hold whatever the model says:
 * outbound never executes from the loop, every entity is checked against the
 * caller's org, internal work needs the role's permission and is recorded.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { OPT_OUT_REASON } from "@helm/dna-communication";

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

import { runAction, type RunDeps } from "../run-action";
import type { AutonomyLevel } from "../autonomy";
import { insertApproval } from "../approvals";
import { defineAction, type AnyAction } from "../types";
import { findClients } from "../actions/read";
import { createTask } from "../actions/internal";
import { sendInvoiceReminder, textClient } from "../actions/outbound";
import { fakeDb, type FakeDb } from "./fake-db";
import { ORG, testContext } from "./context";
import { DANA, INV_1042, INV_OTHER, PRIYA, STRANGER, seedTables } from "./seed";

/**
 * The production wiring, with the run recorder as a spy. `_db` only documents
 * which fake the test runs on. `autonomy` stands in for the dial the owner set
 * — "ask me first" unless a test says otherwise, which is where every
 * teammate who can reach a customer starts.
 */
function deps(actions: AnyAction[], _db?: FakeDb, autonomy: AutonomyLevel = "act_with_approval") {
  const d = {
    getAction: (k: string) => actions.find((a) => a.key === k) ?? null,
    createApproval: vi.fn<RunDeps["createApproval"]>((db, orgId, a) => insertApproval(db, orgId, a)),
    recordRun: vi.fn<RunDeps["recordRun"]>(async () => {}),
    autonomyOf: vi.fn<NonNullable<RunDeps["autonomyOf"]>>(async () => autonomy),
  };
  return d satisfies RunDeps;
}

beforeEach(() => {
  sendSmsAsOrg.mockReset();
  sendReminderForInvoice.mockReset();
});

describe("outbound actions", () => {
  it("never execute from the loop: they become a proposal", async () => {
    const execute = vi.fn();
    const shout = defineAction({
      key: "shout",
      employee: "sarah",
      riskClass: "outbound",
      permission: "clients.write",
      description: "x",
      input: z.object({ to: z.string() }),
      preview: async ({ to }) => ({ ok: true, summary: `Sarah will shout at ${to}`, details: { kind: "text", clientName: to } }),
      execute,
    });
    const db = fakeDb(seedTables());
    const d = deps([shout], db);
    const out = await runAction(testContext(db), "shout", { to: "Priya" }, d, { surface: "ask" });

    expect(out.status).toBe("proposed");
    expect(execute).not.toHaveBeenCalled();
    expect(db.tables.ai_approvals).toHaveLength(1);
    expect(db.tables.ai_approvals[0]).toMatchObject({
      organization_id: ORG,
      employee_slug: "sarah",
      action_key: "shout",
      status: "proposed",
      params: { to: "Priya" },
      summary: "Sarah will shout at Priya",
      source: { surface: "ask", proposed_by: expect.any(String) },
    });
  });

  it("a text to a client is proposed with the drafted message, and the send path is never reached", async () => {
    const db = fakeDb(seedTables());
    const out = await runAction(testContext(db), "text_client", { client_id: PRIYA, message: "Running 10 minutes late" }, deps([textClient], db));
    expect(out.status).toBe("proposed");
    expect(sendSmsAsOrg).not.toHaveBeenCalled();
    expect(db.tables.ai_approvals[0].details).toMatchObject({
      kind: "text",
      clientName: "Priya Shah",
      phone: "(415) 555-0143",
      message: "Running 10 minutes late",
    });
    expect(out.status === "proposed" && out.summary).toBe("Sarah will text Priya Shah at (415) 555-0143");
  });

  it("a payment reminder is proposed with the invoice, amount and recipient", async () => {
    const db = fakeDb(seedTables());
    const out = await runAction(testContext(db), "send_invoice_reminder", { invoice_id: INV_1042 }, deps([sendInvoiceReminder], db));
    expect(out.status).toBe("proposed");
    expect(sendReminderForInvoice).not.toHaveBeenCalled();
    expect(out.status === "proposed" && out.summary).toBe("Alex will email a payment reminder to Dana Lee for INV-1042 · $1,200.00");
    expect(db.tables.ai_approvals[0].details).toMatchObject({ email: "dana@example.com", invoiceNumber: "INV-1042", amount: 1200, daysOverdue: 12 });
  });

  it("refuses another business's client or invoice at preview — no proposal is made", async () => {
    const db = fakeDb(seedTables());
    const d = deps([textClient, sendInvoiceReminder], db);
    const text = await runAction(testContext(db), "text_client", { client_id: STRANGER, message: "hi" }, d);
    const remind = await runAction(testContext(db), "send_invoice_reminder", { invoice_id: INV_OTHER }, d);
    expect(text.status).toBe("rejected");
    expect(remind.status).toBe("rejected");
    expect(db.tables.ai_approvals).toHaveLength(0);
  });

  it("refuses another business's client or invoice at execution too", async () => {
    const db = fakeDb(seedTables());
    const ctx = testContext(db);
    const text = await textClient.execute({ client_id: STRANGER, message: "hi" }, ctx);
    const remind = await sendInvoiceReminder.execute({ invoice_id: INV_OTHER }, ctx);
    expect(text).toEqual({ status: "rejected", reason: "That client is no longer in this business." });
    expect(remind).toEqual({ status: "rejected", reason: "That invoice is no longer in this business." });
    expect(sendSmsAsOrg).not.toHaveBeenCalled();
    expect(sendReminderForInvoice).not.toHaveBeenCalled();
  });

  it("does not line up a text for someone who opted out", async () => {
    const seed = seedTables();
    seed.sms_unsubscribes.push({
      organization_id: ORG,
      phone_number: "+14155550143",
      unsubscribed_at: "2026-09-03T15:00:00.000Z",
      reason: OPT_OUT_REASON.stopReply,
    });
    const db = fakeDb(seed);
    const out = await runAction(testContext(db), "text_client", { client_id: PRIYA, message: "hi" }, deps([textClient], db));
    expect(out.status).toBe("rejected");
    expect(out.status === "rejected" && out.reason).toMatch(/Priya Shah opted out of text messages/);
    expect(db.tables.ai_approvals).toHaveLength(0);
  });

  it("does not propose a reminder to a client with no email", async () => {
    const seed = seedTables();
    (seed.invoices[0] as Record<string, unknown>).client_id = PRIYA;
    const db = fakeDb(seed);
    const out = await runAction(testContext(db), "send_invoice_reminder", { invoice_id: INV_1042 }, deps([sendInvoiceReminder], db));
    expect(out.status).toBe("rejected");
    expect(db.tables.ai_approvals).toHaveLength(0);
  });
});

describe("the autonomy dial", () => {
  it("'ask me first': the text becomes a proposal and nothing is sent", async () => {
    const db = fakeDb(seedTables());
    const out = await runAction(
      testContext(db),
      "text_client",
      { client_id: PRIYA, message: "Running 10 minutes late" },
      deps([textClient], db, "act_with_approval"),
    );
    expect(out.status).toBe("proposed");
    expect(sendSmsAsOrg).not.toHaveBeenCalled();
    expect(db.tables.ai_approvals).toHaveLength(1);
    expect(db.tables.ai_approvals[0]).toMatchObject({ status: "proposed", source: { autonomy: "act_with_approval" } });
  });

  it("'go ahead': the text is sent, and the row records what went out", async () => {
    sendSmsAsOrg.mockResolvedValue({ ok: true, sid: "SM1" });
    const db = fakeDb(seedTables());
    const d = deps([textClient], db, "autonomous");
    const out = await runAction(
      testContext(db),
      "text_client",
      { client_id: PRIYA, message: "Running 10 minutes late" },
      d,
    );

    expect(out.status).toBe("completed");
    expect(sendSmsAsOrg).toHaveBeenCalledTimes(1);
    // It went out through the approval, so the owner can still see exactly
    // what was sent — and the AI activity feed reads executed rows.
    expect(db.tables.ai_approvals).toHaveLength(1);
    expect(db.tables.ai_approvals[0]).toMatchObject({
      status: "executed",
      source: { autonomy: "autonomous", went_ahead: true },
      details: { clientName: "Priya Shah", message: "Running 10 minutes late" },
    });
    expect(db.tables.ai_approvals[0].executed_at).toBeTruthy();
    expect(d.recordRun).toHaveBeenCalledWith(expect.anything(), ORG, "sarah", expect.objectContaining({ status: "succeeded" }));
  });

  it("'suggest only': nothing is sent, nothing is queued, and the model is told to say what it would have done", async () => {
    const db = fakeDb(seedTables());
    const d = deps([textClient], db, "suggest");
    const out = await runAction(testContext(db), "text_client", { client_id: PRIYA, message: "hi" }, d);

    expect(out.status).toBe("rejected");
    expect(out.status === "rejected" && out.reason).toMatch(/suggest only/);
    expect(sendSmsAsOrg).not.toHaveBeenCalled();
    expect(db.tables.ai_approvals).toHaveLength(0);
    expect(d.createApproval).not.toHaveBeenCalled();
  });

  it("'suggest only' holds back internal work too — no task is created", async () => {
    const db = fakeDb(seedTables());
    const d = deps([createTask], db, "suggest");
    const out = await runAction(testContext(db), "create_task", { title: "Call the supplier" }, d);
    expect(out.status).toBe("rejected");
    expect(db.tables.tasks).toHaveLength(0);
    expect(d.recordRun).not.toHaveBeenCalled();
  });

  it("never holds back a read — the dial is about acting, not looking", async () => {
    const db = fakeDb(seedTables());
    const d = deps([findClients], db, "suggest");
    const out = await runAction(testContext(db), "find_clients", { query: "Dana Lee" }, d);
    expect(out.status).toBe("completed");
    expect(d.autonomyOf).not.toHaveBeenCalled();
  });

  it("'go ahead' still parks it when the signed-in member could not send it themselves", async () => {
    const db = fakeDb(seedTables());
    const out = await runAction(
      testContext(db, { role: "viewer" }),
      "text_client",
      { client_id: PRIYA, message: "hi" },
      deps([textClient], db, "autonomous"),
    );
    expect(out.status).toBe("proposed");
    expect(sendSmsAsOrg).not.toHaveBeenCalled();
    expect(db.tables.ai_approvals[0].status).toBe("proposed");
  });
});

describe("read and internal actions", () => {
  it("a read runs at once, scoped to the org", async () => {
    const db = fakeDb(seedTables());
    const out = await runAction(testContext(db), "find_clients", { query: "Dana Lee" }, deps([findClients], db));
    expect(out.status).toBe("completed");
    const data = (out as { data: { matches: Array<{ id: string; name: string }> } }).data;
    expect(data.matches.map((m) => m.id)).toEqual([DANA]);

    // Olga is a client of another business: the search never sees her.
    const other = await runAction(testContext(db), "find_clients", { query: "Olga" }, deps([findClients], db));
    expect((other as { data: { matches: unknown[] } }).data.matches).toEqual([]);
  });

  it("an internal write runs, and is recorded as the employee's run", async () => {
    const db = fakeDb(seedTables());
    const d = deps([createTask], db);
    const out = await runAction(testContext(db), "create_task", { title: "Call the plumber supplier", due_date: "2026-09-12" }, d);
    expect(out.status).toBe("completed");
    expect(db.tables.tasks).toEqual([
      expect.objectContaining({ organization_id: ORG, title: "Call the plumber supplier", due_date: "2026-09-12" }),
    ]);
    expect(d.recordRun).toHaveBeenCalledWith(
      expect.anything(),
      ORG,
      "mark",
      expect.objectContaining({ status: "succeeded", channel: "internal", outcome: expect.objectContaining({ action: "create_task" }) }),
    );
  });

  it("an internal write needs the role's permission", async () => {
    const db = fakeDb(seedTables());
    const d = deps([createTask], db);
    const out = await runAction(testContext(db, { role: "viewer" }), "create_task", { title: "Anything" }, d);
    expect(out.status).toBe("rejected");
    expect(db.tables.tasks).toHaveLength(0);
    expect(d.recordRun).not.toHaveBeenCalled();
  });

  it("an internal write naming another business's client is refused", async () => {
    const db = fakeDb(seedTables());
    const out = await runAction(testContext(db), "create_task", { title: "Call Olga", client_id: STRANGER }, deps([createTask], db));
    expect(out.status).toBe("rejected");
    expect(db.tables.tasks).toHaveLength(0);
  });
});

describe("what the model is told", () => {
  it("an unknown tool is a failure pointing at the honest hand-off", async () => {
    const db = fakeDb();
    const out = await runAction(testContext(db), "post_to_facebook", {}, deps([], db));
    expect(out).toMatchObject({ status: "failed" });
    expect(out.status === "failed" && out.error).toMatch(/hand_off_to_owner/);
  });

  it("invalid input is a failure naming the field", async () => {
    const db = fakeDb();
    const out = await runAction(testContext(db), "text_client", { client_id: "not-a-uuid", message: "" }, deps([textClient], db));
    expect(out.status).toBe("failed");
    expect(out.status === "failed" && out.error).toMatch(/client_id/);
  });

  it("an action that throws is a failure, not an exception", async () => {
    const boom = defineAction({
      key: "boom",
      employee: "mark",
      riskClass: "read",
      permission: "clients.read",
      description: "x",
      input: z.object({}),
      execute: async () => {
        throw new Error("database on fire");
      },
    });
    const db = fakeDb();
    const out = await runAction(testContext(db), "boom", {}, deps([boom], db));
    expect(out.status).toBe("failed");
  });
});
