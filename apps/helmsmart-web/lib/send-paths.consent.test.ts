/**
 * Every library send path, run against rows that say "opted out": the one-to-
 * one inbox sends, the AI panel's route, invoice reminders, reminder texts, AI
 * calls and "Call all", automation emails, and both campaign senders. Each has
 * a positive control beside it, so a guard that refused everything would fail
 * too.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OPT_OUT_REASON } from "@helm/dna-communication";
import { translatorFor } from "@/lib/i18n/translator";
import { fakeSupabase, type FakeDb } from "./__tests__/fake-supabase";

vi.hoisted(() => {
  process.env.TWILIO_ACCOUNT_SID = "AC_test";
  process.env.TWILIO_AUTH_TOKEN = "token";
  process.env.TWILIO_FROM_NUMBER = "+15550000000";
  process.env.RESEND_API_KEY = "re_test";
  process.env.RETELL_AGENT_ID = "agent_test";
  delete process.env.TWILIO_MESSAGING_SERVICE_SID;
});

vi.mock("server-only", () => ({}));

const twilioCreate = vi.hoisted(() => vi.fn());
vi.mock("twilio", () => ({ default: () => ({ messages: { create: twilioCreate } }) }));

const sendEmail = vi.hoisted(() => vi.fn());
vi.mock("@/lib/email", () => ({ sendEmail, FROM_ADDRESS: "noreply@example.com" }));

let f: FakeDb;
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => f.db,
  createServiceClient: async () => f.db,
  createServiceClientFor: () => f.db,
}));

const cookieStore = { get: vi.fn() };
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));
// The membership guard has its own tests (lib/auth/org-context.test.ts). Here
// the caller is a member of whatever org the cookie names.
vi.mock("@/lib/auth/org-context", () => {
  const orgId = (): string | null => cookieStore.get()?.value ?? null;
  const member = async () => {
    const o = orgId();
    return o ? { ok: true, orgId: o, userId: "user-1", role: "owner" } : { ok: false, reason: "no-org", error: "no org" };
  };
  return { getMemberOrgId: async () => orgId(), requireOrgMember: member, requireMemberOf: member };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));

let locale = "en";
vi.mock("@/lib/i18n/server", () => ({
  getServerT: async (ns = "common") => translatorFor(locale, ns),
  getServerLocale: async () => locale,
}));
vi.mock("@/lib/i18n/userLocale", () => ({
  orgWriteLocale: async () => null,
  userUiLocale: async () => null,
  userUiLocales: async () => new Map(),
}));
vi.mock("@/lib/i18n/contactLocale", () => ({ contactLanguageFor: () => "en" }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create: vi.fn() }; } }));
vi.mock("@/lib/language", () => ({
  localizeOutbound: async (s: string) => s,
  detectLanguage: async () => "en",
  replyLanguageRule: () => "",
}));
vi.mock("@/lib/actions/org-update", () => ({ updateOrg: vi.fn() }));
vi.mock("@/lib/integrations/communication-auto-logger", () => ({ logSMSCommunication: vi.fn() }));

const createPhoneCall = vi.hoisted(() => vi.fn());
vi.mock("@/lib/retell", () => ({ createPhoneCall, getRetellNumber: vi.fn() }));
vi.mock("@/lib/receptionist-agent", () => ({
  loadReceptionistContext: async () => ({ orgId: ORG, twilioNumber: "+15550000000", timezone: DAYTIME_TZ }),
  buildOutboundDynamicVariables: () => ({}),
}));

const ORG = "org-1";
const SEP_3 = "2026-09-03T15:00:00.000Z";

const { withinCallingHours } = await import("./outbound-queue");
/** A timezone where it is currently calling hours, so the hours check never masks the consent check. */
const DAYTIME_TZ =
  ["America/Los_Angeles", "America/New_York", "Europe/London", "Asia/Tokyo", "Australia/Sydney", "Pacific/Honolulu", "Asia/Kolkata"].find(
    (tz) => withinCallingHours(tz),
  ) ?? "UTC";

const { sendSms, sendEmail: sendEmailAction } = await import("./actions/messages");
const { sendReminderForInvoice } = await import("./invoice-reminders");
const { drainSmsReminderQueue, placeOutboundCall } = await import("./outbound-queue");
const { callLead, callAll } = await import("./actions/outbound");
const { runAutomations } = await import("./automation-engine");
const { sendSMSCampaign } = await import("./integrations/sms-campaign-sender");
const { sendEmailCampaign } = await import("./integrations/email-campaign-sender");
const smsSendRoute = await import("@/app/api/sms/send/route");
const { CallNotAllowedError } = await import("./outbound-send");

const priya = {
  id: "c1",
  organization_id: ORG,
  first_name: "Priya",
  last_name: "Patel",
  phone: "+16265550101",
  email: "priya@example.com",
  auto_pilot: false,
  status: "active",
};
const sam = { ...priya, id: "c2", first_name: "Sam", last_name: "Lee", phone: "+16265550102", email: "sam@example.com" };

const optedOut = (clientId: string, flags: Record<string, boolean>) => ({
  organization_id: ORG,
  client_id: clientId,
  opted_out_sms: false,
  opted_out_email: false,
  opted_out_calls: false,
  ...flags,
});

beforeEach(() => {
  vi.clearAllMocks();
  locale = "en";
  cookieStore.get.mockReturnValue({ value: ORG });
  twilioCreate.mockResolvedValue({ sid: "SM1", from: "+15550000000" });
  sendEmail.mockResolvedValue({ id: "em_1" });
  createPhoneCall.mockResolvedValue({ callId: "call_1" });
  f = fakeSupabase({ organizations: [{ id: ORG, name: "Acme", twilio_number: "+15550000000" }], clients: [priya, sam] });
});

describe("inbox: sendSms / sendEmail server actions", () => {
  it("refuses a client who replied STOP, with the reason and what is still open", async () => {
    f.rows("sms_unsubscribes").push({
      organization_id: ORG,
      phone_number: "+16265550101",
      unsubscribed_at: SEP_3,
      reason: OPT_OUT_REASON.stopReply,
    });
    const r = await sendSms("c1", "+16265550101", "Are you free Tuesday?");
    expect(r).toEqual({
      ok: false,
      reason: "opted_out",
      error: "Priya Patel opted out of text messages on Sep 3 (replied STOP). You can still email Priya.",
    });
    expect(twilioCreate).not.toHaveBeenCalled();
    expect(f.rows("messages")).toEqual([]);
  });

  it("says it in the owner's language", async () => {
    locale = "zh-Hans";
    f.rows("communication_preferences").push(optedOut("c1", { opted_out_sms: true }));
    const r = await sendSms("c1", "+16265550101", "hi");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/拒收短信/);
  });

  it("sends to a client who has not opted out, recorded as a person's message", async () => {
    const r = await sendSms("c2", "+16265550102", "See you at 3");
    expect(r).toEqual({ ok: true });
    expect(f.rows("messages")[0]).toMatchObject({ client_id: "c2", sent_by: "person" });
  });

  it("returns a translated sentence, not the provider's error, when Twilio fails", async () => {
    twilioCreate.mockRejectedValue(Object.assign(new Error("Twilio internals"), { code: 30001 }));
    const r = await sendSms("c2", "+16265550102", "x");
    expect(r).toEqual({ ok: false, reason: "failed", error: translatorFor("en", "inbox")("errors.smsFailed") });
  });

  it("records a carrier 21610 as an opt-out and says so", async () => {
    twilioCreate.mockRejectedValue(Object.assign(new Error("unsubscribed"), { code: 21610 }));
    const r = await sendSms("c2", "+16265550102", "x");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("opted_out");
      expect(r.error).toMatch(/^Sam Lee opted out of text messages on .+ \(their carrier reported a STOP reply\)\./);
    }
    expect(f.rows("sms_unsubscribes")[0]).toMatchObject({ phone_number: "+16265550102", reason: "carrier_21610" });
  });

  it("refuses an inbox email to a client who opted out of email", async () => {
    f.rows("communication_preferences").push(optedOut("c1", { opted_out_email: true }));
    const r = await sendEmailAction("c1", "priya@example.com", "Re: quote", "Here it is");
    expect(r).toEqual({
      ok: false,
      reason: "opted_out",
      error: "Priya Patel is marked as opted out of email. You can still text Priya.",
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("AI panel: POST /api/sms/send (the Send button)", () => {
  const post = (body: unknown) =>
    smsSendRoute.POST(new Request("https://app.test/api/sms/send", { method: "POST", body: JSON.stringify(body) }) as never);

  it("refuses an opted-out client with the reason the panel shows", async () => {
    f.rows("communication_preferences").push(optedOut("c1", { opted_out_sms: true }));
    const res = await post({ clientId: "c1", to: "+16265550101", body: "Draft" });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ success: false, reason: "opted_out", error: expect.stringMatching(/^Priya Patel/) });
    expect(twilioCreate).not.toHaveBeenCalled();
  });

  // The panel never sends by itself: a Send pressed for an Auto Pilot client
  // is still the person's, or AI activity would list the owner's text as the AI's.
  it("labels a Send as a person's even when the client is on Auto Pilot", async () => {
    f.rows("clients").find((c) => c.id === "c2")!.auto_pilot = true;
    const res = await post({ clientId: "c2", to: "+16265550102", body: "Draft" });
    expect(await res.json()).toEqual({ success: true });
    expect(f.rows("messages")[0]).toMatchObject({ sent_by: "person" });
  });

  it("labels a person's Send as a person's", async () => {
    await post({ clientId: "c2", to: "+16265550102", body: "Draft" });
    expect(f.rows("messages")[0]).toMatchObject({ sent_by: "person" });
  });
});

describe("invoice reminders", () => {
  const invoice = {
    id: "inv-1",
    invoice_number: "INV-001",
    total: 120,
    due_date: "2026-09-01",
    client_id: "c1",
    reminder_count: 0,
    organization_id: ORG,
    clients: { first_name: "Priya", last_name: "Patel", email: "priya@example.com", phone: "+16265550101", preferred_language: "en" },
  };

  it("still emails an opted-out client (transactional) but does not text them", async () => {
    f.rows("communication_preferences").push(optedOut("c1", { opted_out_sms: true, opted_out_email: true }));
    const res = await sendReminderForInvoice(f.db, invoice);
    expect(res).toEqual({ sent: true });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(twilioCreate).not.toHaveBeenCalled();
    expect(f.rows("messages")).toEqual([expect.objectContaining({ channel: "email", sent_by: "reminder" })]);
  });

  it("texts a client who has not opted out, recorded as a reminder", async () => {
    await sendReminderForInvoice(f.db, invoice);
    expect(twilioCreate).toHaveBeenCalledTimes(1);
    expect(f.rows("messages").map((m) => [m.channel, m.sent_by])).toEqual([
      ["email", "reminder"],
      ["sms", "reminder"],
    ]);
  });
});

describe("appointment reminder texts", () => {
  const queue = (clientId: string, id: string) => ({
    id,
    organization_id: ORG,
    client_id: clientId,
    event_id: `ev-${id}`,
    purpose: "appointment_reminder_sms",
    status: "queued",
    created_at: "2026-09-10T00:00:00Z",
  });

  it("skips an opted-out client, marks the row failed with the reason, and still texts the rest", async () => {
    f.rows("communication_preferences").push(optedOut("c1", { opted_out_sms: true }));
    f.rows("outbound_call_queue").push(queue("c1", "q1"), queue("c2", "q2"));
    f.rows("events").push(
      { id: "ev-q1", start_at: "2026-09-11T17:00:00Z", reschedule_token: null },
      { id: "ev-q2", start_at: "2026-09-11T18:00:00Z", reschedule_token: null },
    );
    const res = await drainSmsReminderQueue(f.db, { orgId: ORG, orgName: "Acme", twilioNumber: "+15550000000", timezone: "UTC" });
    expect(res).toEqual({ sent: 1, failed: 1 });
    expect(twilioCreate).toHaveBeenCalledTimes(1);
    expect(twilioCreate).toHaveBeenCalledWith(expect.objectContaining({ to: "+16265550102" }));
    const q1 = f.rows("outbound_call_queue").find((r) => r.id === "q1")!;
    expect(q1).toMatchObject({ status: "failed" });
    expect(String(q1.last_error)).toMatch(/^opted_out:sms/);
    expect(f.rows("messages")).toEqual([expect.objectContaining({ client_id: "c2", sent_by: "reminder", intent: "sms_reminder" })]);
  });
});

describe("AI calls", () => {
  const ctx = { orgId: ORG, twilioNumber: "+15550000000", timezone: DAYTIME_TZ } as never;

  it("placeOutboundCall refuses a client who opted out of calls before Retell is asked", async () => {
    f.rows("communication_preferences").push(optedOut("c1", { opted_out_calls: true }));
    await expect(placeOutboundCall(f.db, ctx, priya, "follow_up" as never, "agent_test")).rejects.toBeInstanceOf(CallNotAllowedError);
    expect(createPhoneCall).not.toHaveBeenCalled();
  });

  it("placeOutboundCall dials a client who opted out of texts only", async () => {
    f.rows("communication_preferences").push(optedOut("c1", { opted_out_sms: true }));
    await placeOutboundCall(f.db, ctx, priya, "follow_up" as never, "agent_test");
    expect(createPhoneCall).toHaveBeenCalledTimes(1);
  });

  it("callLead tells the owner why", async () => {
    f.rows("communication_preferences").push(optedOut("c1", { opted_out_calls: true }));
    const r = await callLead({ clientId: "c1", purpose: "follow_up" as never });
    expect(r).toEqual({
      ok: false,
      error: "Priya Patel is marked as opted out of phone calls. You can still text or email Priya.",
    });
  });

  it("Call all leaves opted-out contacts out of the queue", async () => {
    f.rows("communication_preferences").push(optedOut("c1", { opted_out_calls: true }));
    const r = await callAll({ purpose: "follow_up" as never, clientIds: ["c1", "c2"] });
    expect(r).toEqual({ ok: true, queued: 1, optedOut: 1 });
    expect(f.rows("outbound_call_queue").map((q) => q.client_id)).toEqual(["c2"]);
  });

  it("Call all with only opted-out contacts queues nothing and says why", async () => {
    f.rows("communication_preferences").push(optedOut("c1", { opted_out_calls: true }));
    const r = await callAll({ purpose: "follow_up" as never, clientIds: ["c1"] });
    expect(r).toEqual({ ok: false, error: translatorFor("en", "voice")("outbound.errors.allOptedOut") });
    expect(f.rows("outbound_call_queue")).toEqual([]);
  });
});

describe("automation emails", () => {
  beforeEach(() => {
    f.rows("automation_rules").push({
      id: "rule-1",
      organization_id: ORG,
      enabled: true,
      trigger: "invoice_overdue",
      action: "send_email",
      config: { email_subject: "Reminder", email_body: "Hi {{client_name}}" },
      run_count: 0,
    });
  });

  it("skips a client who opted out of email", async () => {
    f.rows("communication_preferences").push(optedOut("c1", { opted_out_email: true }));
    await runAutomations("invoice_overdue", { orgId: ORG, clientId: "c1", clientEmail: "priya@example.com", clientName: "Priya" });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("emails a client who has not", async () => {
    await runAutomations("invoice_overdue", { orgId: ORG, clientId: "c2", clientEmail: "sam@example.com", clientName: "Sam" });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});

describe("campaigns", () => {
  it("an SMS campaign skips the switch, the STOP list (in any number format) and texts the rest", async () => {
    const kim = { ...priya, id: "c3", first_name: "Kim", phone: "+16265550103", email: "kim@example.com" };
    f.rows("clients").push(kim);
    f.rows("communication_preferences").push(optedOut("c1", { opted_out_sms: true }));
    f.rows("sms_unsubscribes").push({ organization_id: ORG, phone_number: "(626) 555-0103", unsubscribed_at: SEP_3 });
    f.rows("sms_campaigns").push({ id: "camp-1", organization_id: ORG, message_text: "Sale!", target_segment: "all" });

    const res = await sendSMSCampaign(ORG, "camp-1");
    expect(res).toEqual({ ok: true, sent: 1, failed: 0 });
    expect(twilioCreate).toHaveBeenCalledTimes(1);
    expect(twilioCreate).toHaveBeenCalledWith(expect.objectContaining({ to: "+16265550102" }));
    expect(f.rows("messages")).toEqual([]); // a campaign records its own table
  });

  it("an email campaign skips opted-out clients even when told not to exclude unsubscribes", async () => {
    const kim = { ...priya, id: "c3", first_name: "Kim", phone: "+16265550103", email: "kim@example.com" };
    f.rows("clients").push(kim);
    f.rows("communication_preferences").push(optedOut("c1", { opted_out_email: true }));
    f.rows("email_unsubscribes").push({ organization_id: ORG, email: "kim@example.com", unsubscribed_at: SEP_3 });
    f.rows("email_campaigns").push({
      id: "ec-1",
      organization_id: ORG,
      subject: "News",
      body_html: "<p>Hi {{name}}</p>",
      body_text: "Hi",
      target_segment: "all",
      exclude_unsubscribed: false,
    });

    const res = await sendEmailCampaign(ORG, "ec-1");
    expect(res).toEqual({ ok: true, sent: 1, failed: 0 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "sam@example.com" }));
  });
});
