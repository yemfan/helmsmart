/**
 * A failed send keeps what was typed, says why, and never becomes a bubble.
 *
 * The reply box used to be cleared before the send, and a thread with no
 * address appended a message that never left. `settleSend` is what the
 * component does with the server's answer, so these cases are the screen's.
 */
import { describe, expect, it } from "vitest";
import { translatorFor } from "@/lib/i18n/translator";
import { appendMessage, setUnread, settleSend } from "./reply";
import type { InboxMessage, InboxThread } from "./threads";

const t = translatorFor("en", "inbox");
const make = { id: () => "new-1", now: () => new Date("2026-09-11T10:00:00Z") };

const inbound: InboxMessage = {
  id: "m1",
  channel: "sms",
  direction: "inbound",
  subject: null,
  body: "Can you come Tuesday?",
  sent_at: "2026-09-11T09:00:00Z",
  read: true,
  translationEn: null,
  intent: null,
  priority: null,
  sentBy: null,
};

const threads: InboxThread[] = [
  {
    key: "c1",
    clientId: "c1",
    contactAddress: null,
    clientName: "Priya Patel",
    clientEmail: null,
    clientPhone: "+16265550101",
    lastMessage: inbound,
    unreadCount: 2,
    messages: [inbound],
    consent: null,
  },
];

/** What the component does with a settled send. */
const apply = (s: ReturnType<typeof settleSend>) => (s.sent ? appendMessage(threads, "c1", s.message) : threads);

describe("settleSend", () => {
  it("a refusal keeps the text and shows the server's reason as-is", () => {
    const reason = "Priya Patel opted out of text messages on Sep 3 (replied STOP). You can still email Priya.";
    const s = settleSend(
      { body: "Tuesday works", channel: "sms", subject: null },
      { ok: false, reason: "opted_out", error: reason },
      t,
      make,
    );
    expect(s.sent).toBe(false);
    expect(s.draft).toEqual({ body: "Tuesday works", error: `Not sent — ${reason}` });
    expect(apply(s)[0].messages).toHaveLength(1); // no phantom bubble
  });

  it("a provider failure keeps the text too", () => {
    const s = settleSend(
      { body: "Tuesday works", channel: "sms", subject: null },
      { ok: false, reason: "failed", error: "The text didn't go through — the text provider refused it." },
      t,
      make,
    );
    expect(s.draft.body).toBe("Tuesday works");
    expect(s.draft.error).toBe("Not sent — The text didn't go through — the text provider refused it.");
    expect(apply(s)[0].messages).toHaveLength(1);
  });

  it("a call that threw says it could not confirm, rather than 'not sent'", () => {
    const s = settleSend({ body: "Tuesday works", channel: "sms", subject: null }, "unconfirmed", t, make);
    expect(s.sent).toBe(false);
    expect(s.draft.body).toBe("Tuesday works");
    expect(s.draft.error).toBe(t("thread.sendUnconfirmed"));
    expect(apply(s)[0].messages).toHaveLength(1);
  });

  it("only a confirmed send clears the box and becomes a bubble, signed by a person", () => {
    const s = settleSend({ body: "Tuesday works", channel: "email", subject: "Re: Visit" }, { ok: true }, t, make);
    expect(s.draft).toEqual({ body: "", error: null });
    const after = apply(s);
    expect(after[0].messages).toHaveLength(2);
    expect(after[0].lastMessage).toMatchObject({
      id: "new-1",
      direction: "outbound",
      channel: "email",
      subject: "Re: Visit",
      body: "Tuesday works",
      sentBy: "person",
      sent_at: "2026-09-11T10:00:00.000Z",
    });
  });
});

describe("setUnread", () => {
  it("puts the unread dot back when marking read is refused", () => {
    const cleared = setUnread(threads, "c1", 0);
    expect(cleared[0].unreadCount).toBe(0);
    expect(setUnread(cleared, "c1", 2)[0].unreadCount).toBe(2);
  });
});
