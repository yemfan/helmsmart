/**
 * The webhooks that text people nobody asked to text: the inbound-SMS
 * auto-reply (and STOP / START), and the missed-call text from both the Twilio
 * voice route and the Retell webhook.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeDb } from "./__tests__/fake-supabase";

vi.hoisted(() => {
  process.env.TWILIO_ACCOUNT_SID = "AC_test";
  process.env.TWILIO_AUTH_TOKEN = "token";
  process.env.TWILIO_FROM_NUMBER = "+15550000000";
  delete process.env.TWILIO_MESSAGING_SERVICE_SID;
  delete process.env.RETELL_FUNCTION_SECRET;
  delete process.env.ANTHROPIC_API_KEY;
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
vi.mock("@/lib/i18n/userLocale", () => ({ orgWriteLocale: async () => null }));
vi.mock("@/lib/i18n/contactLocale", () => ({ contactLanguageFor: () => "en" }));
vi.mock("@/lib/actions/notifications", () => ({ createNotificationService: vi.fn() }));
vi.mock("@/lib/booking", () => ({
  cancelAppointment: vi.fn(),
  getUpcomingAppointment: async () => null,
  matchOrCreateClient: async () => "c1",
}));
vi.mock("@/lib/receptionist-agent", () => ({ notifyBooking: vi.fn(), findOrgIdByNumber: async () => ORG }));
vi.mock("@helm/ai-workforce", () => ({ dispatchTool: vi.fn() }));
vi.mock("@/lib/workforce-tools", () => ({ createSmsReceptionistRegistry: vi.fn() }));
vi.mock("@/lib/workforce-gating", () => ({ enforceAutonomy: vi.fn() }));
vi.mock("@/lib/workforce-attribution", () => ({ attributeCallToEmma: vi.fn() }));
vi.mock("@/lib/integrations/communication-auto-logger", () => ({
  logInboundSMSCommunication: vi.fn(),
  logSMSCommunication: vi.fn(),
  logCallCommunication: vi.fn(),
}));
vi.mock("@/lib/integrations/slack", () => ({ notifySlackMissedCall: vi.fn() }));
vi.mock("@/lib/missed-call", () => ({ classifyMissed: () => ({ status: "missed" }) }));

const ORG = "org-1";
const BUSINESS = "+15550000000";
const PRIYA = "+16265550101";

const smsRoute = await import("@/app/api/twilio/sms/route");
const voiceRoute = await import("@/app/api/twilio/voice/route");
const retellRoute = await import("@/app/api/retell/webhook/route");

const priya = {
  id: "c1",
  organization_id: ORG,
  first_name: "Priya",
  last_name: "Patel",
  phone: PRIYA,
  email: "priya@example.com",
  preferred_language: "en",
  auto_pilot: false,
};

function seed(extra: Record<string, Record<string, unknown>[]> = {}) {
  f = fakeSupabase({
    organizations: [
      { id: ORG, name: "Acme", twilio_number: BUSINESS, auto_reply: true, auto_reply_msg: "Thanks — we'll call you back." },
    ],
    clients: [priya],
    ...extra,
  });
}

const inboundSms = (body: string) => {
  const form = new FormData();
  form.set("From", PRIYA);
  form.set("To", BUSINESS);
  form.set("Body", body);
  form.set("MessageSid", "SM_in");
  return smsRoute.POST(new Request("https://app.test/api/twilio/sms", { method: "POST", body: form }) as never);
};

const outbound = () => f.rows("messages").filter((m) => m.direction === "outbound");

beforeEach(() => {
  vi.clearAllMocks();
  pending.length = 0;
  twilioCreate.mockResolvedValue({ sid: "SM_out", from: BUSINESS });
  seed();
});

describe("inbound SMS: STOP and START", () => {
  it("STOP persists the opt-out on the client and in sms_unsubscribes, and sends nothing", async () => {
    await inboundSms("STOP");
    expect(f.rows("sms_unsubscribes")).toEqual([
      expect.objectContaining({ organization_id: ORG, phone_number: PRIYA, reason: "stop_keyword" }),
    ]);
    expect(f.rows("communication_preferences")).toEqual([
      expect.objectContaining({ client_id: "c1", opted_out_sms: true }),
    ]);
    expect(twilioCreate).not.toHaveBeenCalled();
    // The STOP itself is still in the inbox.
    expect(f.rows("messages")).toEqual([expect.objectContaining({ direction: "inbound", body: "STOP" })]);
  });

  it("START clears it again", async () => {
    seed({
      sms_unsubscribes: [{ organization_id: ORG, phone_number: PRIYA, unsubscribed_at: "2026-09-03T00:00:00Z", reason: "stop_keyword" }],
      communication_preferences: [{ organization_id: ORG, client_id: "c1", opted_out_sms: true }],
    });
    await inboundSms("START");
    expect(f.rows("sms_unsubscribes")).toEqual([]);
    expect(f.rows("communication_preferences")[0]).toMatchObject({ opted_out_sms: false });
    expect(twilioCreate).not.toHaveBeenCalled();
  });

  it("after a STOP, the next message gets no auto-reply", async () => {
    await inboundSms("STOP");
    await inboundSms("actually, what time do you open?");
    expect(twilioCreate).not.toHaveBeenCalled();
    expect(outbound()).toEqual([]);
  });

  it("an opted-out client gets no auto-reply even for an ordinary message", async () => {
    seed({ communication_preferences: [{ organization_id: ORG, client_id: "c1", opted_out_sms: true }] });
    await inboundSms("hello, are you open Saturday?");
    expect(twilioCreate).not.toHaveBeenCalled();
    expect(outbound()).toEqual([]);
  });

  it("(control) a client who has not opted out gets the auto-reply, labelled as one", async () => {
    await inboundSms("hello, are you open Saturday?");
    expect(twilioCreate).toHaveBeenCalledTimes(1);
    expect(outbound()).toEqual([expect.objectContaining({ sent_by: "auto_reply", to_address: PRIYA, client_id: "c1" })]);
  });
});

describe("missed-call text: Twilio voice webhook", () => {
  const missedCall = async () => {
    const form = new FormData();
    form.set("From", PRIYA);
    form.set("To", BUSINESS);
    form.set("CallSid", "CA1");
    await voiceRoute.POST(new Request("https://app.test/api/twilio/voice", { method: "POST", body: form }) as never);
    await Promise.all(pending);
  };

  it("does not text a caller who opted out, and leaves the call un-replied", async () => {
    seed({
      communication_preferences: [{ organization_id: ORG, client_id: "c1", opted_out_sms: true }],
      calls: [],
    });
    await missedCall();
    expect(twilioCreate).not.toHaveBeenCalled();
    expect(f.rows("calls")[0]).toMatchObject({ twilio_call_sid: "CA1", auto_replied: false });
  });

  it("(control) texts a caller who has not, labelled as the missed-call text", async () => {
    await missedCall();
    expect(twilioCreate).toHaveBeenCalledTimes(1);
    expect(outbound()).toEqual([expect.objectContaining({ sent_by: "missed_call_text", client_id: "c1" })]);
    expect(f.rows("calls")[0]).toMatchObject({ auto_replied: true });
  });
});

describe("missed-call text: Retell webhook", () => {
  const callEnded = async () => {
    const body = {
      event: "call_ended",
      call: {
        call_id: "call-1",
        direction: "inbound",
        from_number: PRIYA,
        to_number: BUSINESS,
        disconnection_reason: "user_hangup",
        transcript_object: [],
        retell_llm_dynamic_variables: { org_id: ORG },
      },
    };
    await retellRoute.POST(
      new Request("https://app.test/api/retell/webhook", { method: "POST", body: JSON.stringify(body) }) as never,
    );
    await Promise.all(pending);
  };

  it("does not text a caller who replied STOP", async () => {
    seed({
      sms_unsubscribes: [{ organization_id: ORG, phone_number: PRIYA, unsubscribed_at: "2026-09-03T00:00:00Z", reason: "stop_keyword" }],
    });
    await callEnded();
    expect(twilioCreate).not.toHaveBeenCalled();
    expect(f.rows("calls")[0]).toMatchObject({ auto_replied: false });
  });

  it("(control) texts a caller who has not", async () => {
    await callEnded();
    expect(twilioCreate).toHaveBeenCalledTimes(1);
    expect(outbound()).toEqual([expect.objectContaining({ sent_by: "missed_call_text" })]);
  });
});
