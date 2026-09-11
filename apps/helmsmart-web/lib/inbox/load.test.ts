/**
 * The thread header's opt-out state comes from the same loader and the same
 * decision the send path uses. The loader is mocked; the decision is real.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OPT_OUT_REASON } from "@helm/dna-communication";
import { translatorFor } from "@/lib/i18n/translator";

vi.mock("@/lib/consent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/consent")>();
  return { ...actual, loadOrgOptOuts: vi.fn() };
});

const { loadOrgOptOuts } = await import("@/lib/consent");
const { withConsent } = await import("./load");
const { blockedReason, channelState, consentLines, defaultReplyChannel } = await import("./threads");
type InboxThread = import("./threads").InboxThread;

const t = translatorFor("en", "inbox");
const SEP_3 = "2026-09-03T12:00:00Z";
const db = {} as never;

function thread(over: Partial<InboxThread>): InboxThread {
  const last = {
    id: "m1",
    channel: "sms" as const,
    direction: "inbound" as const,
    subject: null,
    body: "STOP",
    sent_at: SEP_3,
    read: true,
    translationEn: null,
    intent: null,
    priority: null,
    sentBy: null,
  };
  return {
    key: "c1",
    clientId: "c1",
    contactAddress: null,
    clientName: "Priya Patel",
    clientEmail: "priya@example.com",
    clientPhone: "(626) 555-0101",
    lastMessage: last,
    unreadCount: 0,
    messages: [last],
    consent: null,
    ...over,
  };
}

const mocked = vi.mocked(loadOrgOptOuts);

beforeEach(() => {
  mocked.mockReset();
});

describe("withConsent", () => {
  it("a STOP reply recorded by number shows in the header and closes texting", async () => {
    mocked.mockResolvedValue({
      prefsByClient: new Map(),
      // Keyed by the last ten digits, however the number was written.
      smsByPhone: new Map([["6265550101", { unsubscribed_at: SEP_3, reason: OPT_OUT_REASON.stopReply }]]),
      emailByAddress: new Map(),
    });
    const [x] = await withConsent(db, "org-1", [thread({})]);

    expect(mocked).toHaveBeenCalledWith(db, "org-1");
    expect(consentLines(x, t, "en")).toEqual(["Opted out of texts since Sep 3 · replied STOP"]);
    expect(channelState(x, "sms").available).toBe(false);
    expect(defaultReplyChannel(x)).toBe("email");
    expect(blockedReason(x, "email", t, "en")).toBeNull();
  });

  it("the client's own switch counts, by client id", async () => {
    mocked.mockResolvedValue({
      prefsByClient: new Map([["c1", { opted_out_sms: false, opted_out_email: true, opted_out_calls: false }]]),
      smsByPhone: new Map(),
      emailByAddress: new Map(),
    });
    const [x] = await withConsent(db, "org-1", [thread({ lastMessage: { ...thread({}).lastMessage, channel: "email" } })]);
    expect(consentLines(x, t, "en")).toEqual(["Opted out of email"]);
    expect(channelState(x, "email").available).toBe(false);
  });

  it("a carrier-reported STOP says so", async () => {
    mocked.mockResolvedValue({
      prefsByClient: new Map(),
      smsByPhone: new Map([["6265550101", { unsubscribed_at: SEP_3, reason: OPT_OUT_REASON.carrier }]]),
      emailByAddress: new Map(),
    });
    const [x] = await withConsent(db, "org-1", [thread({})]);
    expect(consentLines(x, t, "en")).toEqual(["Opted out of texts since Sep 3 · their carrier reported STOP"]);
  });

  it("when the opt-outs can't be read, shows no state rather than a guessed one", async () => {
    mocked.mockRejectedValue(new Error("boom"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const [x] = await withConsent(db, "org-1", [thread({})]);
    spy.mockRestore();
    expect(x.consent).toBeNull();
    expect(consentLines(x, t, "en")).toEqual([]);
  });

  it("does not read anything for an empty inbox", async () => {
    expect(await withConsent(db, "org-1", [])).toEqual([]);
    expect(mocked).not.toHaveBeenCalled();
  });
});
