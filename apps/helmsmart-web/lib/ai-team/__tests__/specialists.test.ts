/**
 * The three specialists added after the first round of tools: Sarah's AI call,
 * Emily's social post and Emma's booking.
 *
 * Each is asked the same four questions the first round answered, because each
 * reaches outside the business in its own way:
 *
 *   1. does the PREVIEW describe exactly what approving would do, and does the
 *      fingerprint cover the parts that choose it (who, where, what, when)?
 *   2. does it refuse an entity that belongs to ANOTHER business?
 *   3. does it refuse for the right reason — a call opt-out, a network nobody
 *      connected, a slot that was taken — in the owner's own words?
 *   4. does approving it run EXACTLY once, however many clicks arrive?
 *
 * Nothing real is reachable from here: the queue, the booking module and the
 * SMS choke point are all mocked, so no test can dial, post or book.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("twilio", () => ({ default: () => ({ messages: { create: vi.fn() } }) }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(), FROM_ADDRESS: "noreply@example.com" }));
vi.mock("@/lib/invoice-reminders", () => ({ sendReminderForInvoice: vi.fn() }));

const sendSmsAsOrg = vi.hoisted(() => vi.fn());
vi.mock("@/lib/outbound-send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/outbound-send")>()),
  sendSmsAsOrg,
}));

const enqueueCalls = vi.hoisted(() => vi.fn());
vi.mock("@/lib/outbound-queue", () => ({ enqueueCalls }));

const serviceDb = vi.hoisted(() => ({ tag: "service-client" }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: async () => serviceDb }));

const getAvailability = vi.hoisted(() => vi.fn());
const bookAppointment = vi.hoisted(() => vi.fn());
const rescheduleAppointment = vi.hoisted(() => vi.fn());
const getUpcomingAppointment = vi.hoisted(() => vi.fn());
vi.mock("@/lib/booking", () => ({ getAvailability, bookAppointment, rescheduleAppointment, getUpcomingAppointment }));

import { decideApprovalCore, type DecideDeps, type DecideInput } from "../decide";
import { bookAppointmentAction, draftSocialPost, scheduleAiCall } from "../actions/outbound";
import { checkAvailability } from "../actions/read";
import { runAction, type RunDeps } from "../run-action";
import { insertApproval } from "../approvals";
import { pickDetails, type ApprovalRow } from "../approval-view";
import { approvalFingerprint } from "../fingerprint.server";
import { fakeDb, type FakeDb } from "./fake-db";
import { ORG, OTHER_ORG, testContext } from "./context";
import { DANA, PRIYA, STRANGER, seedTables } from "./seed";

/**
 * The Thursday morning slot the calendar offers, and the one it doesn't —
 * 9am and 8am in `testContext`'s timezone (America/New_York, so UTC-4 in
 * September). The label is the action's own, computed from the instant in the
 * BUSINESS's timezone rather than taken from the availability result.
 */
const SLOT = "2026-09-17T13:00:00.000Z";
const SLOT_LABEL = "Thursday, September 17 at 9 AM";
const NOT_A_SLOT = "2026-09-17T12:00:00.000Z";

function tables(over: Record<string, Record<string, unknown>[]> = {}) {
  return {
    ...seedTables(),
    org_oauth_tokens: [
      { organization_id: ORG, provider: "linkedin" },
      { organization_id: ORG, provider: "meta" },
      // Another business's Threads grant must never widen ours.
      { organization_id: OTHER_ORG, provider: "threads" },
    ],
    appointment_types: [
      { id: "t1", organization_id: ORG, name: "Cleaning", duration_minutes: 60, active: true, sort: 0 },
      { id: "t2", organization_id: OTHER_ORG, name: "Audit", duration_minutes: 30, active: true, sort: 0 },
    ],
    social_posts: [],
    messages: [],
    ...over,
  };
}

const runDeps = (): RunDeps => ({
  getAction: (k) => [scheduleAiCall, draftSocialPost, bookAppointmentAction, checkAvailability].find((a) => a.key === k) ?? null,
  createApproval: (client, orgId, a) => insertApproval(client, orgId, a),
  recordRun: vi.fn(async () => {}),
  /*
   * These are tests about each ACTION — what it previews, what it refuses, what
   * approving it does. The owner's autonomy dial decides whether a proposal is
   * also run on the spot (`lib/ai-team/autonomy.ts`), and Emma ships on "go
   * ahead", so without pinning it here `book_appointment` would book rather
   * than park and every assertion below would be about the dial instead.
   * The dial has its own tests in `autonomy.test.ts` and `run-action.test.ts`.
   */
  autonomyOf: async () => "act_with_approval",
});

const decideDeps = (): DecideDeps => ({
  getAction: (k) => [scheduleAiCall, draftSocialPost, bookAppointmentAction].find((a) => a.key === k) ?? null,
  recordRun: vi.fn(async () => {}),
});

/** Approve the way the card does: with a fingerprint of exactly what it showed. */
function asShown(row: ApprovalRow, message?: string): DecideInput {
  const d = pickDetails(row.details);
  return {
    edits: message !== undefined ? { message } : undefined,
    fingerprint: approvalFingerprint(row.action_key, { ...d, message: message ?? d.message }),
  };
}

/** Propose through the real runner, then hand back the row the owner would see. */
async function propose(db: FakeDb, key: string, input: unknown, over: Parameters<typeof testContext>[1] = {}) {
  const outcome = await runAction(testContext(db, over), key, input, runDeps());
  return outcome;
}

beforeEach(() => {
  vi.clearAllMocks();
  getAvailability.mockResolvedValue({ closed: false, durationMinutes: 60, slots: [{ startISO: SLOT, label: SLOT_LABEL }] });
  getUpcomingAppointment.mockResolvedValue(null);
  bookAppointment.mockResolvedValue({ ok: true, startISO: SLOT, label: SLOT_LABEL, eventId: "evt-1" });
  rescheduleAppointment.mockResolvedValue({ ok: true, startISO: SLOT, label: SLOT_LABEL, eventId: "evt-old" });
  enqueueCalls.mockResolvedValue(1);
  sendSmsAsOrg.mockResolvedValue({ ok: true, externalId: "SM1" });
});

// ── Sarah: schedule_ai_call ──────────────────────────────────────────────────

describe("schedule_ai_call", () => {
  it("previews who is called, on which number and what about — and parks it rather than dialling", async () => {
    const db = fakeDb(tables());
    const out = await propose(db, "schedule_ai_call", { client_id: PRIYA, purpose: "follow_up", note: "Ask about the quote." });

    expect(out.status).toBe("proposed");
    if (out.status !== "proposed") throw new Error("not proposed");
    expect(out.summary).toContain("Priya Shah");
    expect(out.summary).toContain("(415) 555-0143");
    expect(pickDetails(out.approval.details)).toMatchObject({
      kind: "call",
      clientId: PRIYA,
      clientName: "Priya Shah",
      phone: "(415) 555-0143",
      callPurpose: "follow_up",
      note: "Ask about the quote.",
    });
    // Nothing was queued: proposing is not doing.
    expect(enqueueCalls).not.toHaveBeenCalled();
  });

  it("fingerprints the client, the number and the purpose — so a purpose swap is a different call", () => {
    const base = { clientId: PRIYA, phone: "(415) 555-0143", callPurpose: "follow_up", note: null };
    const fp = (over: Record<string, unknown>) => approvalFingerprint("schedule_ai_call", { ...base, ...over });
    expect(fp({})).toBe(fp({ clientName: "P. Shah" }));
    expect(fp({ callPurpose: "promo" })).not.toBe(fp({}));
    expect(fp({ phone: "(415) 555-0999" })).not.toBe(fp({}));
    expect(fp({ clientId: DANA })).not.toBe(fp({}));
  });

  it("will not call another business's client", async () => {
    const db = fakeDb(tables());
    const out = await propose(db, "schedule_ai_call", { client_id: STRANGER, purpose: "follow_up" });
    expect(out).toMatchObject({ status: "rejected" });
    if (out.status !== "rejected") throw new Error("not rejected");
    expect(out.reason).toMatch(/not a client of this business/);
  });

  it("refuses a client who opted out of calls, in the owner's words", async () => {
    const db = fakeDb(
      tables({
        communication_preferences: [{ organization_id: ORG, client_id: PRIYA, opted_out_sms: false, opted_out_email: false, opted_out_calls: true }],
      }),
    );
    const out = await propose(db, "schedule_ai_call", { client_id: PRIYA, purpose: "follow_up" });
    expect(out.status).toBe("rejected");
    expect(db.tables.ai_approvals).toHaveLength(0);
  });

  it("refuses a client with no number", async () => {
    const db = fakeDb(tables({ clients: seedTables().clients.map((c) => (c.id === PRIYA ? { ...c, phone: null } : c)) }));
    const out = await propose(db, "schedule_ai_call", { client_id: PRIYA, purpose: "follow_up" });
    expect(out).toMatchObject({ status: "rejected" });
    if (out.status !== "rejected") throw new Error("not rejected");
    expect(out.reason).toMatch(/no phone number/);
  });

  it("asks for a script before proposing a survey or a promo", async () => {
    const db = fakeDb(tables());
    for (const purpose of ["survey", "promo"]) {
      const out = await propose(db, "schedule_ai_call", { client_id: PRIYA, purpose });
      expect(out, purpose).toMatchObject({ status: "rejected" });
    }
    expect(await propose(db, "schedule_ai_call", { client_id: PRIYA, purpose: "survey", note: "Rate the visit 1-5." })).toMatchObject({
      status: "proposed",
    });
  });

  it("queues the call exactly once, however many times Approve is clicked", async () => {
    const db = fakeDb(tables());
    const out = await propose(db, "schedule_ai_call", { client_id: PRIYA, purpose: "follow_up", note: "Quote follow-up." });
    if (out.status !== "proposed") throw new Error("not proposed");
    const shown = asShown(out.approval);
    const deps = decideDeps();

    const [first, second] = await Promise.all([
      decideApprovalCore(testContext(db), out.approval.id, "approve", shown, deps),
      decideApprovalCore(testContext(db), out.approval.id, "approve", shown, deps),
    ]);

    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
    expect(enqueueCalls).toHaveBeenCalledTimes(1);
    // The service client, because the queue has no insert policy for a member.
    expect(enqueueCalls).toHaveBeenCalledWith(serviceDb, ORG, "follow_up", [PRIYA], "Quote follow-up.");
    expect(db.tables.ai_approvals[0]).toMatchObject({ status: "executed" });
  });

  it("says so plainly when a call of that kind is already waiting", async () => {
    const db = fakeDb(tables());
    enqueueCalls.mockResolvedValue(0);
    const out = await propose(db, "schedule_ai_call", { client_id: PRIYA, purpose: "follow_up" });
    if (out.status !== "proposed") throw new Error("not proposed");

    const res = await decideApprovalCore(testContext(db), out.approval.id, "approve", asShown(out.approval), decideDeps());
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected a refusal");
    expect(res.error).toBe("Priya Shah already has a call of this kind waiting to go out.");
    expect(db.tables.ai_approvals[0]).toMatchObject({ status: "failed" });
  });
});

// ── Emily: draft_social_post ─────────────────────────────────────────────────

describe("draft_social_post", () => {
  it("previews the network, the words and when they go out", async () => {
    const db = fakeDb(tables());
    const out = await propose(db, "draft_social_post", {
      network: "facebook",
      content: "Fall special: 15% off drain cleaning.",
      scheduled_at: "2026-09-20T17:00:00.000Z",
      topic: "fall special",
    });

    expect(out.status).toBe("proposed");
    if (out.status !== "proposed") throw new Error("not proposed");
    expect(pickDetails(out.approval.details)).toMatchObject({
      kind: "social",
      network: "facebook",
      message: "Fall special: 15% off drain cleaning.",
      scheduledFor: "2026-09-20T17:00:00.000Z",
      note: "fall special",
    });
    expect(db.tables.social_posts).toHaveLength(0);
  });

  it("isn't offered at all when no social account is connected", async () => {
    const db = fakeDb(tables({ org_oauth_tokens: [] }));
    const out = await propose(db, "draft_social_post", { network: "linkedin", content: "Hello" });
    expect(out).toMatchObject({ status: "rejected" });
    if (out.status !== "rejected") throw new Error("not rejected");
    expect(out.reason).toMatch(/no social account connected/i);
  });

  it("refuses a network this business hasn't connected, and names the ones it has", async () => {
    const db = fakeDb(tables());
    const out = await propose(db, "draft_social_post", { network: "threads", content: "Hello" });
    expect(out).toMatchObject({ status: "rejected" });
    if (out.status !== "rejected") throw new Error("not rejected");
    expect(out.reason).toMatch(/threads isn't connected/i);
    expect(out.reason).toMatch(/linkedin/);
    expect(out.reason).toMatch(/facebook/);
  });

  it("refuses a posting time that has already passed", async () => {
    const db = fakeDb(tables());
    const out = await propose(db, "draft_social_post", {
      network: "linkedin",
      content: "Hello",
      scheduled_at: "2026-09-01T17:00:00.000Z",
    });
    expect(out).toMatchObject({ status: "rejected" });
  });

  it("saves a scheduled post on approval — never a publish", async () => {
    const db = fakeDb(tables());
    const out = await propose(db, "draft_social_post", {
      network: "linkedin",
      content: "Fall special!",
      scheduled_at: "2026-09-20T17:00:00.000Z",
    });
    if (out.status !== "proposed") throw new Error("not proposed");

    const res = await decideApprovalCore(testContext(db), out.approval.id, "approve", asShown(out.approval), decideDeps());
    expect(res.ok).toBe(true);
    expect(db.tables.social_posts).toHaveLength(1);
    expect(db.tables.social_posts[0]).toMatchObject({
      organization_id: ORG,
      platform: "linkedin",
      content: "Fall special!",
      status: "scheduled",
      scheduled_at: "2026-09-20T17:00:00.000Z",
      generated_by_ai: true,
    });
  });

  it("saves a draft when no time was given, and writes exactly one row for two clicks", async () => {
    const db = fakeDb(tables());
    const out = await propose(db, "draft_social_post", { network: "linkedin", content: "Evergreen post" });
    if (out.status !== "proposed") throw new Error("not proposed");
    const shown = asShown(out.approval);
    const deps = decideDeps();

    const [a, b] = await Promise.all([
      decideApprovalCore(testContext(db), out.approval.id, "approve", shown, deps),
      decideApprovalCore(testContext(db), out.approval.id, "approve", shown, deps),
    ]);

    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(db.tables.social_posts).toHaveLength(1);
    expect(db.tables.social_posts[0]).toMatchObject({ status: "draft", scheduled_at: null });
  });

  it("keeps the owner's edit of the words, and refuses everything else changing under them", async () => {
    const db = fakeDb(tables());
    const out = await propose(db, "draft_social_post", { network: "linkedin", content: "First draft" });
    if (out.status !== "proposed") throw new Error("not proposed");

    const edited = "The owner's own words";
    const res = await decideApprovalCore(testContext(db), out.approval.id, "approve", asShown(out.approval, edited), decideDeps());
    expect(res.ok).toBe(true);
    expect(db.tables.social_posts[0]).toMatchObject({ content: edited });
  });

  it("reports a refused insert as a failure rather than as saved", async () => {
    const db = fakeDb(tables());
    const out = await propose(db, "draft_social_post", { network: "linkedin", content: "Hello" });
    if (out.status !== "proposed") throw new Error("not proposed");
    db.failNext("social_posts", "insert", 'new row violates row-level security policy for table "social_posts"');

    const res = await decideApprovalCore(testContext(db), out.approval.id, "approve", asShown(out.approval), decideDeps());
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected a failure");
    expect(res.error).toBe("The post couldn't be saved. Try again.");
    expect(db.tables.ai_approvals[0]).toMatchObject({ status: "failed" });
  });
});

// ── Emma: check_availability + book_appointment ──────────────────────────────

describe("check_availability", () => {
  it("returns the openings and this business's own appointment types", async () => {
    const db = fakeDb(tables());
    const out = await runAction(testContext(db), "check_availability", { appointment_type: "Cleaning", date: "2026-09-17" }, runDeps());

    expect(out.status).toBe("completed");
    if (out.status !== "completed") throw new Error("not completed");
    const data = out.data as { slots: { start: string }[]; appointment_types: { name: string }[] };
    expect(data.slots).toEqual([{ start: SLOT, label: SLOT_LABEL }]);
    // The other business's "Audit" is not one of ours.
    expect(data.appointment_types.map((t) => t.name)).toEqual(["Cleaning"]);
  });

  it("says so when the business has no appointment types set up", async () => {
    const db = fakeDb(tables({ appointment_types: [] }));
    const out = await runAction(testContext(db), "check_availability", { appointment_type: "Cleaning", date: "2026-09-17" }, runDeps());
    expect(out).toMatchObject({ status: "rejected" });
    expect(getAvailability).not.toHaveBeenCalled();
  });
});

describe("book_appointment", () => {
  it("previews the client, the service, the slot in the business's timezone and the confirmation text", async () => {
    const db = fakeDb(tables());
    const out = await propose(db, "book_appointment", { client_id: PRIYA, appointment_type: "Cleaning", start: SLOT });

    expect(out.status).toBe("proposed");
    if (out.status !== "proposed") throw new Error("not proposed");
    expect(pickDetails(out.approval.details)).toMatchObject({
      kind: "appointment",
      clientId: PRIYA,
      clientName: "Priya Shah",
      appointmentType: "Cleaning",
      slotStart: SLOT,
      slotLabel: SLOT_LABEL,
      message: `You're confirmed for ${SLOT_LABEL}. See you then!`,
      reschedulesFrom: null,
    });
    expect(bookAppointment).not.toHaveBeenCalled();
  });

  it("offers no slot the availability check didn't return", async () => {
    const db = fakeDb(tables());
    const out = await propose(db, "book_appointment", { client_id: PRIYA, appointment_type: "Cleaning", start: NOT_A_SLOT });
    expect(out).toMatchObject({ status: "rejected" });
    if (out.status !== "rejected") throw new Error("not rejected");
    expect(out.reason).toMatch(/no longer open/);
  });

  it("will not book for another business's client", async () => {
    const db = fakeDb(tables());
    const out = await propose(db, "book_appointment", { client_id: STRANGER, appointment_type: "Cleaning", start: SLOT });
    expect(out).toMatchObject({ status: "rejected" });
  });

  it("re-checks availability at the moment of approval, and refuses a slot someone took", async () => {
    const db = fakeDb(tables());
    const out = await propose(db, "book_appointment", { client_id: PRIYA, appointment_type: "Cleaning", start: SLOT });
    if (out.status !== "proposed") throw new Error("not proposed");

    // Between the proposal and the click, someone else took 9 AM.
    getAvailability.mockResolvedValue({ closed: false, durationMinutes: 60, slots: [] });

    const res = await decideApprovalCore(testContext(db), out.approval.id, "approve", asShown(out.approval), decideDeps());
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected a refusal");
    expect(res.error).toBe("That time was taken — ask Mark for another.");
    expect(bookAppointment).not.toHaveBeenCalled();
    expect(db.tables.ai_approvals[0]).toMatchObject({ status: "failed" });
  });

  it("books once for two clicks, through the receptionist's own booking code, and texts the confirmation", async () => {
    const db = fakeDb(tables());
    const out = await propose(db, "book_appointment", { client_id: PRIYA, appointment_type: "Cleaning", start: SLOT });
    if (out.status !== "proposed") throw new Error("not proposed");
    const shown = asShown(out.approval);
    const deps = decideDeps();

    const [a, b] = await Promise.all([
      decideApprovalCore(testContext(db), out.approval.id, "approve", shown, deps),
      decideApprovalCore(testContext(db), out.approval.id, "approve", shown, deps),
    ]);

    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(bookAppointment).toHaveBeenCalledTimes(1);
    expect(bookAppointment).toHaveBeenCalledWith(ORG, {
      appointmentTypeName: "Cleaning",
      startISO: SLOT,
      clientId: PRIYA,
      callerName: "Priya Shah",
    });
    expect(sendSmsAsOrg).toHaveBeenCalledTimes(1);
    expect(sendSmsAsOrg).toHaveBeenCalledWith(
      db,
      ORG,
      expect.objectContaining({ clientId: PRIYA, body: `You're confirmed for ${SLOT_LABEL}. See you then!`, sentBy: "receptionist" }),
    );
  });

  it("moves an appointment the client already has rather than adding a second one", async () => {
    const db = fakeDb(tables());
    getUpcomingAppointment.mockResolvedValue({
      eventId: "evt-old",
      startISO: "2026-09-15T17:00:00.000Z",
      label: "Tuesday, September 15 at 10 AM",
      rescheduleToken: "tok",
    });
    const out = await propose(db, "book_appointment", { client_id: PRIYA, appointment_type: "Cleaning", start: SLOT });
    if (out.status !== "proposed") throw new Error("not proposed");
    expect(pickDetails(out.approval.details).reschedulesFrom).toBe("Tuesday, September 15 at 10 AM");

    const res = await decideApprovalCore(testContext(db), out.approval.id, "approve", asShown(out.approval), decideDeps());
    expect(res.ok).toBe(true);
    expect(rescheduleAppointment).toHaveBeenCalledWith(ORG, { eventId: "evt-old", startISO: SLOT });
    expect(bookAppointment).not.toHaveBeenCalled();
  });

  it("promises no confirmation text to a client who opted out of texts", async () => {
    const db = fakeDb(
      tables({
        communication_preferences: [{ organization_id: ORG, client_id: PRIYA, opted_out_sms: true, opted_out_email: false, opted_out_calls: false }],
      }),
    );
    const out = await propose(db, "book_appointment", { client_id: PRIYA, appointment_type: "Cleaning", start: SLOT });
    expect(out.status).toBe("proposed");
    if (out.status !== "proposed") throw new Error("not proposed");
    expect(pickDetails(out.approval.details).message).toBeNull();
  });

  it("still books when the confirmation text fails — the appointment is real either way", async () => {
    const db = fakeDb(tables());
    const out = await propose(db, "book_appointment", { client_id: PRIYA, appointment_type: "Cleaning", start: SLOT });
    if (out.status !== "proposed") throw new Error("not proposed");
    sendSmsAsOrg.mockRejectedValue(new Error("Twilio is down"));

    const res = await decideApprovalCore(testContext(db), out.approval.id, "approve", asShown(out.approval), decideDeps());
    expect(res.ok).toBe(true);
    expect(bookAppointment).toHaveBeenCalledTimes(1);
  });
});
