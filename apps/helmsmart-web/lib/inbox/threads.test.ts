/**
 * The inbox's rules, run as the screen runs them: which conversations a
 * channel filter shows, who an outbound message is labelled as, whether a
 * conversation can be replied to and why not, and what an email reply is
 * titled.
 */
import { describe, expect, it } from "vitest";
import { translatorFor } from "@/lib/i18n/translator";
import type { ChannelOptOut } from "@/lib/consent";
import {
  addressedChannels,
  blockedReason,
  buildThreads,
  channelState,
  composeTarget,
  consentLines,
  defaultReplyChannel,
  filterThreads,
  previewMessage,
  previewPrefix,
  replySubject,
  type InboxMessage,
  type InboxThread,
  type MessageRow,
} from "./threads";

const t = translatorFor("en", "inbox");
const SEP_3 = "2026-09-03T12:00:00Z";

let seq = 0;
function msg(over: Partial<InboxMessage> = {}): InboxMessage {
  seq++;
  return {
    id: `m${seq}`,
    channel: "sms",
    direction: "inbound",
    subject: null,
    body: `message ${seq}`,
    sent_at: new Date(Date.UTC(2026, 8, 1, 12, seq)).toISOString(),
    read: true,
    translationEn: null,
    intent: null,
    priority: null,
    sentBy: null,
    ...over,
  };
}

function thread(messages: InboxMessage[], over: Partial<InboxThread> = {}): InboxThread {
  return {
    key: "c1",
    clientId: "c1",
    contactAddress: null,
    clientName: "Priya Patel",
    clientEmail: "priya@example.com",
    clientPhone: "+16265550101",
    lastMessage: messages[messages.length - 1],
    unreadCount: 0,
    messages,
    consent: null,
    ...over,
  };
}

const OPEN: ChannelOptOut = { optedOut: false, via: null, since: null };
const STOPPED: ChannelOptOut = { optedOut: true, via: "stop_reply", since: SEP_3 };

// ─── Filter ───────────────────────────────────────────────────────────────────

describe("the channel filter", () => {
  const emailThenText = thread([msg({ channel: "email", subject: "Quote" }), msg({ channel: "sms" })], { key: "a" });
  const textOnly = thread([msg({ channel: "sms" })], { key: "b" });

  it("shows a conversation with ANY message on the channel, not only its last", () => {
    // The old filter read the last message only, so this thread vanished from Email.
    expect(filterThreads([emailThenText, textOnly], "email").map((x) => x.key)).toEqual(["a"]);
    expect(filterThreads([emailThenText, textOnly], "sms").map((x) => x.key)).toEqual(["a", "b"]);
    expect(filterThreads([emailThenText, textOnly], "all")).toHaveLength(2);
  });

  it("previews the latest message on the filtered channel", () => {
    expect(previewMessage(emailThenText, "email").channel).toBe("email");
    expect(previewMessage(emailThenText, "all")).toBe(emailThenText.lastMessage);
  });
});

// ─── Provenance ───────────────────────────────────────────────────────────────

describe("who an outbound preview is from", () => {
  it("names the real sender instead of 'You:'", () => {
    expect(previewPrefix(msg({ direction: "outbound", sentBy: "auto_pilot" }), t)).toBe("Auto Pilot: ");
    expect(previewPrefix(msg({ direction: "outbound", sentBy: "reminder" }), t)).toBe("Automatic reminder: ");
    expect(previewPrefix(msg({ direction: "outbound", sentBy: "missed_call_text" }), t)).toBe("Missed-call text: ");
  });

  it("keeps 'You' for a person, and for rows from before sent_by existed", () => {
    expect(previewPrefix(msg({ direction: "outbound", sentBy: "person" }), t)).toBe("You: ");
    expect(previewPrefix(msg({ direction: "outbound", sentBy: null }), t)).toBe("You: ");
  });

  it("puts nothing before an inbound message", () => {
    expect(previewPrefix(msg({ direction: "inbound" }), t)).toBe("");
  });

  it("uses the reader's language", () => {
    expect(previewPrefix(msg({ direction: "outbound", sentBy: "auto_pilot" }), translatorFor("zh-Hans", "inbox"))).toBe(
      "自动驾驶：",
    );
  });
});

// ─── Building ─────────────────────────────────────────────────────────────────

describe("buildThreads", () => {
  const client = { id: "c1", first_name: "Priya", last_name: "Patel", email: "priya@example.com", phone: "+16265550101" };
  const row = (over: Partial<MessageRow>): MessageRow => ({
    id: "r",
    channel: "sms",
    direction: "inbound",
    subject: null,
    body: "hi",
    sent_at: "2026-09-01T10:00:00Z",
    read: true,
    client_id: null,
    from_address: null,
    to_address: null,
    translation_en: null,
    intent: null,
    priority: null,
    sent_by: null,
    clients: null,
    ...over,
  });

  it("groups by client, then by address, newest conversation first", () => {
    const threads = buildThreads(
      [
        row({ id: "1", client_id: "c1", clients: client, from_address: "+16265550101", read: false }),
        row({ id: "2", from_address: "+16265559999", sent_at: "2026-09-02T10:00:00Z" }),
        row({ id: "3", client_id: "c1", clients: [client], direction: "outbound", to_address: "+16265550101", sent_by: "auto_pilot", sent_at: "2026-09-01T11:00:00Z" }),
      ],
      "Unknown",
    );
    expect(threads.map((x) => x.key)).toEqual(["addr:+16265559999", "c1"]);
    const priya = threads[1];
    expect(priya.clientName).toBe("Priya Patel");
    expect(priya.unreadCount).toBe(1);
    expect(priya.messages.map((m) => m.sentBy)).toEqual([null, "auto_pilot"]);
    expect(priya.consent).toBeNull();
    expect(threads[0]).toMatchObject({ clientName: "+16265559999", clientPhone: "+16265559999", clientEmail: null });
  });

  it("never carries sent_by on an inbound row", () => {
    const [only] = buildThreads([row({ from_address: "a@b.co", channel: "email", sent_by: "person" })], "Unknown");
    expect(only.lastMessage.sentBy).toBeNull();
    expect(only.clientEmail).toBe("a@b.co");
  });
});

// ─── Replying ─────────────────────────────────────────────────────────────────

describe("who a conversation can be replied to on", () => {
  it("disables Send, with a reason, when there is no phone and no email at all", () => {
    const x = thread([msg()], { clientPhone: null, clientEmail: null, clientId: null, key: "unknown" });
    expect(addressedChannels(x)).toEqual([]);
    expect(channelState(x, "sms").available).toBe(false);
    expect(blockedReason(x, defaultReplyChannel(x), t, "en")).toBe(
      "There's no phone number or email address to reply to.",
    );
  });

  it("opens on email when they texted STOP but can still be emailed", () => {
    const x = thread([msg({ channel: "sms" })], { consent: { sms: STOPPED, email: OPEN } });
    expect(defaultReplyChannel(x)).toBe("email");
    expect(blockedReason(x, "email", t, "en")).toBeNull();
    expect(blockedReason(x, "sms", t, "en")).toBe(
      "You can't text this contact. Opted out of texts since Sep 3 · replied STOP.",
    );
  });

  it("stays on the refused channel, saying why, when it is the only one", () => {
    const x = thread([msg({ channel: "sms" })], { clientEmail: null, consent: { sms: STOPPED, email: OPEN } });
    expect(defaultReplyChannel(x)).toBe("sms");
    expect(addressedChannels(x)).toEqual(["sms"]);
    expect(blockedReason(x, "sms", t, "en")).toMatch(/^You can't text this contact\./);
  });

  it("says a channel has no address rather than pretending it is open", () => {
    const x = thread([msg({ channel: "email" })], { clientPhone: null });
    expect(blockedReason(x, "sms", t, "en")).toBe("This contact has no phone number to text.");
    expect(blockedReason(x, "email", t, "en")).toBeNull();
  });

  it("shows no opt-out it could not read", () => {
    const x = thread([msg()], { consent: null });
    expect(consentLines(x, t, "en")).toEqual([]);
    expect(channelState(x, "sms").available).toBe(true);
  });
});

describe("the thread header's consent state", () => {
  it("says since when, and how", () => {
    const x = thread([msg()], {
      consent: { sms: STOPPED, email: { optedOut: true, via: "unsubscribed", since: SEP_3 } },
    });
    expect(consentLines(x, t, "en")).toEqual([
      "Opted out of texts since Sep 3 · replied STOP",
      "Unsubscribed from email since Sep 3",
    ]);
  });

  it("covers a carrier-reported STOP and a switch with no date", () => {
    const carrier = thread([msg()], { consent: { sms: { optedOut: true, via: "carrier", since: SEP_3 }, email: OPEN } });
    expect(consentLines(carrier, t, "en")).toEqual(["Opted out of texts since Sep 3 · their carrier reported STOP"]);
    const marked = thread([msg()], { consent: { sms: { optedOut: true, via: "marked", since: null }, email: OPEN } });
    expect(consentLines(marked, t, "en")).toEqual(["Opted out of texts"]);
  });

  it("is silent when every channel is open", () => {
    expect(consentLines(thread([msg()], { consent: { sms: OPEN, email: OPEN } }), t, "en")).toEqual([]);
  });
});

describe("an email reply's subject", () => {
  const x = thread([msg({ channel: "email", subject: "RE: Re: Kitchen quote" }), msg({ channel: "sms" })]);

  it("comes from the latest email, prefixed once, in the owner's language", () => {
    expect(replySubject(x, t)).toBe("Re: Kitchen quote");
    expect(replySubject(x, translatorFor("zh-Hans", "inbox"))).toBe("回复：Kitchen quote");
    expect(replySubject(x, translatorFor("es", "inbox"))).toBe("RE: Kitchen quote");
  });

  it("falls back to the compose box's 'no subject' when no email had one", () => {
    expect(replySubject(thread([msg({ channel: "sms" })]), t)).toBe("(No subject)");
  });
});

describe("composeTarget (?compose= from a client's page)", () => {
  const clients = [
    { id: "c1", email: "Priya@Example.com" },
    { id: "c2", email: null },
  ];

  it("opens the compose box for a client id, on email", () => {
    expect(composeTarget("c2", clients)).toEqual({ clientId: "c2", channel: "email" });
  });

  it("still resolves the email address older links carried", () => {
    expect(composeTarget("priya@example.com", clients)).toEqual({ clientId: "c1", channel: "email" });
  });

  it("opens nothing for an address or id it does not know", () => {
    expect(composeTarget("someone@else.com", clients)).toBeNull();
    expect(composeTarget("", clients)).toBeNull();
    expect(composeTarget(undefined, clients)).toBeNull();
  });
});
