/**
 * The choke point: consent before the provider, provenance on the row, and a
 * carrier's "unsubscribed" turned into a recorded opt-out.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OPT_OUT_REASON } from "@helm/dna-communication";
import { fakeSupabase, type FakeDb } from "./__tests__/fake-supabase";

vi.hoisted(() => {
  process.env.TWILIO_ACCOUNT_SID = "AC_test";
  process.env.TWILIO_AUTH_TOKEN = "token";
  process.env.TWILIO_FROM_NUMBER = "+15550000000";
  delete process.env.TWILIO_MESSAGING_SERVICE_SID;
});

const twilioCreate = vi.hoisted(() => vi.fn());
vi.mock("twilio", () => ({ default: () => ({ messages: { create: twilioCreate } }) }));

const sendEmail = vi.hoisted(() => vi.fn());
vi.mock("@/lib/email", () => ({ sendEmail, FROM_ADDRESS: "noreply@example.com" }));

const { sendSmsGuarded, sendEmailGuarded, guardCall, TWILIO_UNSUBSCRIBED } = await import("./outbound-send");

const ORG = "org-1";
const SEP_3 = "2026-09-03T15:00:00.000Z";
const client = {
  id: "c1",
  organization_id: ORG,
  first_name: "Priya",
  last_name: "Patel",
  phone: "+16265550101",
  email: "priya@example.com",
};

let f: FakeDb;
beforeEach(() => {
  vi.clearAllMocks();
  twilioCreate.mockResolvedValue({ sid: "SM1", from: "+15550000000" });
  sendEmail.mockResolvedValue({ id: "em_1" });
  f = fakeSupabase({ clients: [client] });
});

const sms = (over: Partial<Parameters<typeof sendSmsGuarded>[0]> = {}) =>
  sendSmsGuarded({
    db: f.db,
    orgId: ORG,
    clientId: "c1",
    to: "(626) 555-0101",
    body: "Hi Priya",
    fromNumber: "+15550000000",
    purpose: "conversation",
    sentBy: "person",
    ...over,
  });

describe("sendSmsGuarded", () => {
  it("sends, normalizes the number and records who sent it", async () => {
    const out = await sms({ sentBy: "auto_pilot", purpose: "automated", intent: "x" });
    expect(out).toEqual({ ok: true, externalId: "SM1" });
    expect(twilioCreate).toHaveBeenCalledWith(expect.objectContaining({ to: "+16265550101", body: "Hi Priya" }));
    expect(f.rows("messages")).toEqual([
      expect.objectContaining({
        channel: "sms",
        direction: "outbound",
        client_id: "c1",
        to_address: "+16265550101",
        sent_by: "auto_pilot",
        intent: "x",
        external_id: "SM1",
      }),
    ]);
  });

  it("refuses an opted-out client before Twilio is called, and writes nothing", async () => {
    f = fakeSupabase({
      clients: [client],
      communication_preferences: [{ organization_id: ORG, client_id: "c1", opted_out_sms: true }],
    });
    const out = await sms();
    expect(out).toMatchObject({ ok: false, reason: "opted_out", decision: { channel: "sms", via: "marked" } });
    expect(twilioCreate).not.toHaveBeenCalled();
    expect(f.rows("messages")).toEqual([]);
  });

  it("refuses a number in sms_unsubscribes even with no client", async () => {
    f = fakeSupabase({
      sms_unsubscribes: [{ organization_id: ORG, phone_number: "+16265550188", unsubscribed_at: SEP_3, reason: "stop_keyword" }],
    });
    const out = await sms({ clientId: null, to: "+16265550188", purpose: "automated", sentBy: "auto_reply" });
    expect(out).toMatchObject({ ok: false, reason: "opted_out", decision: { via: "stop_reply", since: SEP_3 } });
    expect(twilioCreate).not.toHaveBeenCalled();
  });

  it("does not check a client's consent for the business's own alert phone", async () => {
    f = fakeSupabase({
      sms_unsubscribes: [{ organization_id: ORG, phone_number: "+16265550199", unsubscribed_at: SEP_3 }],
    });
    const out = await sms({ clientId: null, to: "+16265550199", recipient: "business", sentBy: "receptionist" });
    expect(out.ok).toBe(true);
    expect(twilioCreate).toHaveBeenCalledTimes(1);
  });

  it("turns Twilio 21610 into a recorded opt-out and a reason, not a raw error", async () => {
    twilioCreate.mockRejectedValue(Object.assign(new Error("Attempt to send to unsubscribed recipient"), { code: TWILIO_UNSUBSCRIBED }));
    const out = await sms();
    expect(out).toMatchObject({ ok: false, reason: "opted_out", decision: { source: "sms_unsubscribe", via: "carrier" } });
    expect(f.rows("sms_unsubscribes")).toEqual([
      expect.objectContaining({ phone_number: "+16265550101", reason: OPT_OUT_REASON.carrier }),
    ]);
    expect(f.rows("communication_preferences")[0]).toMatchObject({ client_id: "c1", opted_out_sms: true });
    expect(f.rows("messages")).toEqual([]);
  });

  it("reports any other provider failure without recording a send", async () => {
    twilioCreate.mockRejectedValue(Object.assign(new Error("nope"), { code: 21211 }));
    const out = await sms();
    expect(out).toMatchObject({ ok: false, reason: "provider", code: 21211 });
    expect(f.rows("messages")).toEqual([]);
    expect(f.rows("sms_unsubscribes")).toEqual([]);
  });

  it("rejects an address that is not a phone number", async () => {
    const out = await sms({ to: "not a phone" });
    expect(out).toMatchObject({ ok: false, reason: "invalid_address" });
    expect(twilioCreate).not.toHaveBeenCalled();
  });

  it("fails closed when consent can't be read", async () => {
    const broken = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: "down" } }) }) }) }) }) };
    const out = await sendSmsGuarded({
      db: broken as never,
      orgId: ORG,
      clientId: "c1",
      to: "+16265550101",
      body: "x",
      fromNumber: null,
      purpose: "automated",
      sentBy: "reminder",
    });
    expect(out).toEqual({ ok: false, reason: "consent_unavailable" });
    expect(twilioCreate).not.toHaveBeenCalled();
  });

  it("uses preloaded consent for a bulk send without a lookup", async () => {
    const out = await sms({ consentInputs: { preferences: { opted_out_sms: true } }, sentBy: undefined, purpose: "marketing" });
    expect(out).toMatchObject({ ok: false, reason: "opted_out" });
  });
});

describe("sendEmailGuarded", () => {
  const email = (over: Partial<Parameters<typeof sendEmailGuarded>[0]> = {}) =>
    sendEmailGuarded({
      db: f.db,
      orgId: ORG,
      clientId: "c1",
      to: "priya@example.com",
      subject: "Hello",
      text: "Body",
      purpose: "conversation",
      sentBy: "person",
      ...over,
    });

  it("sends and records who sent it", async () => {
    expect(await email()).toEqual({ ok: true, externalId: "em_1" });
    expect(f.rows("messages")[0]).toMatchObject({ channel: "email", sent_by: "person", external_id: "em_1" });
  });

  it("refuses conversation, automated and marketing mail after an email opt-out", async () => {
    f = fakeSupabase({
      clients: [client],
      communication_preferences: [{ organization_id: ORG, client_id: "c1", opted_out_email: true }],
    });
    for (const purpose of ["conversation", "automated", "marketing"] as const) {
      expect(await email({ purpose })).toMatchObject({ ok: false, reason: "opted_out" });
    }
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("still sends transactional mail after an email opt-out", async () => {
    f = fakeSupabase({
      clients: [client],
      communication_preferences: [{ organization_id: ORG, client_id: "c1", opted_out_email: true }],
    });
    expect(await email({ purpose: "transactional", sentBy: "reminder" })).toMatchObject({ ok: true });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(f.rows("messages")[0]).toMatchObject({ sent_by: "reminder" });
  });

  it("writes no row when there is no sender to record", async () => {
    await email({ sentBy: undefined, purpose: "automated" });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(f.rows("messages")).toEqual([]);
  });
});

describe("guardCall", () => {
  it("refuses a client who opted out of calls", async () => {
    f = fakeSupabase({
      clients: [client],
      communication_preferences: [{ organization_id: ORG, client_id: "c1", opted_out_calls: true }],
    });
    expect(await guardCall(f.db, ORG, { clientId: "c1" })).toMatchObject({ ok: false, reason: "opted_out" });
  });
  it("allows a client who opted out of texts only", async () => {
    f = fakeSupabase({
      clients: [client],
      communication_preferences: [{ organization_id: ORG, client_id: "c1", opted_out_sms: true }],
    });
    expect(await guardCall(f.db, ORG, { clientId: "c1" })).toEqual({ ok: true });
  });
});
