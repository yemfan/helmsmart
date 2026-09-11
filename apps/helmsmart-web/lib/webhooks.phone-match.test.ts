/**
 * The three inbound paths that recognise a client by phone: a missed call on
 * the Twilio voice webhook, an inbound text, and a public form submission.
 * Each matched `eq("phone", …)` exactly, so a client the owner typed in as
 * "(415) 555-0143" was a stranger to caller ID "+14155550143" — the call and
 * the text landed unattached, and the form created a duplicate lead.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeDb } from "./__tests__/fake-supabase";

vi.hoisted(() => {
  process.env.TWILIO_ACCOUNT_SID = "AC_test";
  process.env.TWILIO_AUTH_TOKEN = "token";
  process.env.TWILIO_FROM_NUMBER = "+15550000000";
  delete process.env.TWILIO_MESSAGING_SERVICE_SID;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.RESEND_API_KEY;
});

vi.mock("server-only", () => ({}));

const pending = vi.hoisted(() => [] as Promise<unknown>[]);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (fn: () => unknown) => {
    pending.push(Promise.resolve().then(fn));
  },
}));

const twilioCreate = vi.hoisted(() => vi.fn());
vi.mock("twilio", () => {
  class VoiceResponse {
    say() {}
    hangup() {}
    toString() {
      return "<Response/>";
    }
  }
  const factory = Object.assign(() => ({ messages: { create: twilioCreate } }), { twiml: { VoiceResponse } });
  return { default: factory };
});

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(), FROM_ADDRESS: "noreply@example.com" }));

let f: FakeDb;
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => f.db,
  createServiceClient: async () => f.db,
}));

vi.mock("@/lib/twilio-verify", () => ({
  verifyTwilioSignature: () => true,
  formParams: (fd: FormData) => Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)])),
}));
vi.mock("@/lib/language", () => ({
  analyzeInbound: async () => ({ lang: "en", intent: "general", priority: "normal" }),
  translateTo: async (s: string) => s,
  localizeOutbound: async (s: string) => s,
  intentLabel: (s: string) => s,
  replyLanguageRule: () => "",
}));
vi.mock("@/lib/i18n/userLocale", () => ({ orgWriteLocale: async () => null, userUiLocale: async () => null }));
vi.mock("@/lib/i18n/contactLocale", () => ({ contactLanguageFor: () => "en" }));
vi.mock("@/lib/i18n/translator", () => ({ translatorFor: () => (k: string) => k }));
vi.mock("@/lib/org-recipients", () => ({ orgOwnerRecipients: async () => [] }));
vi.mock("@/lib/notifications-service", () => ({ createNotificationService: vi.fn() }));
vi.mock("@/lib/booking", () => ({
  cancelAppointment: vi.fn(),
  getUpcomingAppointment: async () => null,
}));
vi.mock("@/lib/receptionist-agent", () => ({ notifyBooking: vi.fn() }));
vi.mock("@helm/ai-workforce", () => ({ dispatchTool: vi.fn() }));
vi.mock("@/lib/workforce-tools", () => ({ createSmsReceptionistRegistry: vi.fn() }));
vi.mock("@/lib/workforce-gating", () => ({ enforceAutonomy: vi.fn() }));
vi.mock("@/lib/integrations/communication-auto-logger", () => ({
  logInboundSMSCommunication: vi.fn(),
  logSMSCommunication: vi.fn(),
}));
vi.mock("@/lib/integrations/slack", () => ({
  notifySlackFormSubmission: vi.fn(),
  notifySlackNewLead: vi.fn(),
}));

const ORG = "org-1";
const BUSINESS = "+15550000000";
const CALLER_ID = "+14155550143";

const smsRoute = await import("@/app/api/twilio/sms/route");
const voiceRoute = await import("@/app/api/twilio/voice/route");
const formRoute = await import("@/app/api/forms/[slug]/route");

const client = (id: string, phone: string, over: Record<string, unknown> = {}) => ({
  id,
  organization_id: ORG,
  first_name: "Priya",
  phone,
  preferred_language: "en",
  auto_pilot: false,
  created_at: "2026-01-01T00:00:00Z",
  ...over,
});

function seed(clients: Record<string, unknown>[]) {
  f = fakeSupabase({
    organizations: [
      { id: ORG, name: "Acme", twilio_number: BUSINESS, auto_reply: false, auto_reply_msg: null },
    ],
    form_definitions: [
      {
        id: "form-1",
        slug: "contact",
        is_active: true,
        organization_id: ORG,
        auto_create_client: true,
        title: "Contact",
        success_message: "Thanks!",
        submission_count: 0,
        fields: [
          { id: "name", type: "text", label: "Name" },
          { id: "phone", type: "phone", label: "Phone" },
        ],
      },
    ],
    clients,
  });
}

const STORED_SHAPES = [
  "+14155550143",
  "(415) 555-0143",
  "415-555-0143",
  "415.555.0143",
  "415 555 0143",
  "4155550143",
  "14155550143",
  "+1 (415) 555-0143",
];

/** Two clients with the number: the one someone entered, and a lead made later. */
const realAndLaterLead = () => [
  client("lead", "+14155550143", { created_at: "2026-09-01T00:00:00Z" }),
  client("real", "415-555-0143", { created_at: "2026-01-01T00:00:00Z" }),
];

beforeEach(() => {
  vi.clearAllMocks();
  pending.length = 0;
  twilioCreate.mockResolvedValue({ sid: "SM_out", from: BUSINESS });
});

describe("Twilio voice webhook: a missed call", () => {
  const missedCall = async (from = CALLER_ID) => {
    const form = new FormData();
    form.set("From", from);
    form.set("To", BUSINESS);
    form.set("CallSid", "CA1");
    await voiceRoute.POST(new Request("https://app.test/api/twilio/voice", { method: "POST", body: form }) as never);
    await Promise.all(pending);
  };

  it.each(STORED_SHAPES)("is logged against a client stored as %s", async (stored) => {
    seed([client("c1", stored)]);
    await missedCall();
    expect(f.rows("calls")).toEqual([expect.objectContaining({ twilio_call_sid: "CA1", client_id: "c1" })]);
  });

  it("goes to the oldest client when two share the number, rather than dropping the link", async () => {
    seed(realAndLaterLead());
    await missedCall();
    expect(f.rows("calls")[0]).toMatchObject({ client_id: "real" });
  });

  it("is not attached to a different number, or to another business's client", async () => {
    seed([client("c1", "(415) 777-0143"), client("other", "(415) 555-0143", { organization_id: "org-2" })]);
    await missedCall();
    expect(f.rows("calls")[0]).toMatchObject({ client_id: null });
  });
});

describe("Twilio SMS webhook: an inbound text", () => {
  const inboundSms = async (from = CALLER_ID) => {
    const form = new FormData();
    form.set("From", from);
    form.set("To", BUSINESS);
    form.set("Body", "are you open Saturday?");
    form.set("MessageSid", "SM_in");
    await smsRoute.POST(new Request("https://app.test/api/twilio/sms", { method: "POST", body: form }) as never);
  };
  const inbound = () => f.rows("messages").filter((m) => m.direction === "inbound");

  it.each(STORED_SHAPES)("lands on a client stored as %s", async (stored) => {
    seed([client("c1", stored)]);
    await inboundSms();
    expect(inbound()).toEqual([expect.objectContaining({ client_id: "c1", from_address: CALLER_ID })]);
  });

  it("goes to the oldest client when two share the number", async () => {
    seed(realAndLaterLead());
    await inboundSms();
    expect(inbound()[0]).toMatchObject({ client_id: "real" });
  });

  it("is not attached to a different number, or to another business's client", async () => {
    seed([client("c1", "(415) 777-0143"), client("other", "(415) 555-0143", { organization_id: "org-2" })]);
    await inboundSms();
    expect(inbound()[0]).toMatchObject({ client_id: null });
  });
});

describe("public form submission", () => {
  const submit = (body: Record<string, unknown>) =>
    formRoute.POST(
      new Request("https://app.test/api/forms/contact", { method: "POST", body: JSON.stringify(body) }) as never,
      { params: Promise.resolve({ slug: "contact" }) },
    );
  const clientIds = () => f.rows("clients").map((c) => c.id);

  it.each(STORED_SHAPES)("attaches to a client stored as %s instead of creating a duplicate", async (stored) => {
    seed([client("c1", stored)]);
    const res = await submit({ name: "Priya Patel", phone: "+1 415 555 0143" });
    expect(res.status).toBe(200);
    expect(f.rows("form_submissions")).toEqual([expect.objectContaining({ client_id: "c1" })]);
    expect(clientIds()).toEqual(["c1"]);
  });

  it("goes to the oldest client when two share the number", async () => {
    seed(realAndLaterLead());
    await submit({ name: "Priya Patel", phone: "(415) 555-0143" });
    expect(f.rows("form_submissions")[0]).toMatchObject({ client_id: "real" });
    expect(clientIds()).toEqual(["lead", "real"]);
  });

  it("still matches a phone posted as a JSON number", async () => {
    seed([client("c1", "(415) 555-0143")]);
    const res = await submit({ name: "Priya Patel", phone: 4155550143 });
    expect(res.status).toBe(200);
    expect(f.rows("form_submissions")[0]).toMatchObject({ client_id: "c1" });
  });

  it("creates a lead for a number no client has, and not in another business", async () => {
    seed([client("c1", "(415) 777-0143"), client("other", "(415) 555-0143", { organization_id: "org-2" })]);
    await submit({ name: "Sam Lee", phone: CALLER_ID });
    const created = f.rows("clients").find((c) => !["c1", "other"].includes(c.id as string));
    expect(created).toMatchObject({ organization_id: ORG, first_name: "Sam", phone: CALLER_ID, source: "form" });
    expect(f.rows("form_submissions")[0]).toMatchObject({ client_id: created!.id });
  });

  it("a blank phone matches nobody", async () => {
    seed([client("blank", "   ")]);
    await submit({ name: "Sam Lee", phone: "   " });
    expect(f.rows("form_submissions")[0].client_id).not.toBe("blank");
  });
});
