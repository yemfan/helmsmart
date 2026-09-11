/**
 * What the reply box holds after the server answers a send.
 *
 * The inbox used to clear the box BEFORE sending, so a refused or failed send
 * lost what was typed — and a conversation with no phone or email appended a
 * bubble for a message that never left. The rule now: the text stays until the
 * server says the message went; a refusal shows the server's own sentence
 * ("Priya Patel opted out of text messages on Sep 3 (replied STOP)."), and only
 * a confirmed send becomes a bubble.
 */
import type { SendMessageResult } from "@/lib/outbound-send";
import type { Channel, InboxMessage, InboxThread } from "@/lib/inbox/threads";

type Translate = (key: string, opts?: Record<string, unknown>) => string;

/*
 * The inbox actions' answers. Declared here rather than in the "use server"
 * module, which should export nothing but its actions.
 */

/** `markThreadRead`: ok only when the rows are read now. */
export type MarkReadResult = { ok: true } | { ok: false; error: string };

/** `draftReply`: the draft, or the sentence to show instead. */
export type DraftReplyResult = { ok: true; text: string } | { ok: false; error: string };

export interface ReplyDraft {
  body: string;
  /** The sentence shown under the composer, or null. */
  error: string | null;
}

export type SendSettled =
  | { sent: true; draft: ReplyDraft; message: InboxMessage }
  | { sent: false; draft: ReplyDraft };

/**
 * `outcome` is the action's result, or "unconfirmed" when the call itself
 * threw — a dropped connection or a server error — in which case nobody knows
 * whether the provider took it, and the owner is told exactly that.
 */
export function settleSend(
  sent: { body: string; channel: Channel; subject: string | null },
  outcome: SendMessageResult | "unconfirmed",
  t: Translate,
  make: { id: () => string; now: () => Date } = { id: () => crypto.randomUUID(), now: () => new Date() },
): SendSettled {
  if (outcome === "unconfirmed") {
    return { sent: false, draft: { body: sent.body, error: t("thread.sendUnconfirmed") } };
  }
  if (!outcome.ok) {
    // The server's sentence is already translated and is the one that says why.
    return { sent: false, draft: { body: sent.body, error: t("thread.notSent", { reason: outcome.error }) } };
  }
  return {
    sent: true,
    draft: { body: "", error: null },
    message: {
      id: make.id(),
      channel: sent.channel,
      direction: "outbound",
      subject: sent.subject,
      body: sent.body,
      sent_at: make.now().toISOString(),
      read: true,
      translationEn: null,
      intent: null,
      priority: null,
      sentBy: "person",
    },
  };
}

/** Add a confirmed message to its conversation. */
export function appendMessage(threads: InboxThread[], key: string, message: InboxMessage): InboxThread[] {
  return threads.map((t) => (t.key === key ? { ...t, lastMessage: message, messages: [...t.messages, message] } : t));
}

/** Set a conversation's unread count — to 0 when opened, back when the write is refused. */
export function setUnread(threads: InboxThread[], key: string, unreadCount: number): InboxThread[] {
  return threads.map((t) => (t.key === key ? { ...t, unreadCount } : t));
}
