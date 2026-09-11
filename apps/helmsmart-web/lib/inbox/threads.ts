/**
 * The inbox's conversations: grouped from `messages` rows on the server, then
 * filtered, labelled and replied to in the browser.
 *
 * Pure — no Supabase, no React, no server imports — so the page and the client
 * component share one set of rules, and the tests exercise the same code the
 * screen runs. The consent types come from `lib/consent.ts` as types only; the
 * loader that fills them in is `lib/inbox/load.ts`, which runs on the server.
 */
import { intlLocale } from "@leadsmart/i18n";
import type { ChannelOptOut } from "@/lib/consent";
import { senderLabel } from "@/lib/message-provenance";

export type Channel = "sms" | "email";
export type ChannelFilter = "all" | Channel;
type Translate = (key: string, opts?: Record<string, unknown>) => string;

export interface InboxMessage {
  id: string;
  channel: Channel;
  direction: "inbound" | "outbound";
  subject: string | null;
  body: string;
  sent_at: string;
  read: boolean;
  translationEn: string | null;
  intent: string | null;
  priority: string | null;
  /** `messages.sent_by` — who or what sent an outbound row; null for inbound and old rows. */
  sentBy: string | null;
}

/** Whether each channel is open, as the send path would decide it. */
export interface ThreadConsent {
  sms: ChannelOptOut;
  email: ChannelOptOut;
}

export interface InboxThread {
  key: string;
  clientId: string | null;
  contactAddress: string | null;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  lastMessage: InboxMessage;
  unreadCount: number;
  messages: InboxMessage[];
  /**
   * Null when the opt-outs could not be read. The screen then shows no opt-out
   * state rather than a guessed one — and the send path, which fails closed,
   * still refuses with its own reason.
   */
  consent: ThreadConsent | null;
}

/** One `messages` row as the inbox page selects it. */
export interface MessageRow {
  id: string;
  channel: string;
  direction: string;
  subject: string | null;
  body: string;
  sent_at: string;
  read: boolean;
  client_id: string | null;
  from_address: string | null;
  to_address: string | null;
  translation_en: string | null;
  intent: string | null;
  priority: string | null;
  sent_by?: string | null;
  clients:
    | { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null }
    | Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null }>
    | null;
}

// ─── Building threads (server) ────────────────────────────────────────────────

/**
 * Group rows (oldest first) into conversations: by client when the row has
 * one, otherwise by the other party's address, so two unknown senders do not
 * collapse into one "Unknown" thread. Most recent conversation first.
 */
export function buildThreads(rows: MessageRow[], unknownLabel: string): InboxThread[] {
  const byKey = new Map<string, InboxThread>();

  for (const row of rows) {
    const client = Array.isArray(row.clients) ? (row.clients[0] ?? null) : row.clients;
    const direction = row.direction === "outbound" ? "outbound" : "inbound";
    const contactAddress = (direction === "inbound" ? row.from_address : row.to_address) ?? null;
    const key = row.client_id ?? (contactAddress ? `addr:${contactAddress}` : "unknown");
    const isEmailAddr = !!contactAddress && contactAddress.includes("@");

    const message: InboxMessage = {
      id: row.id,
      channel: row.channel === "email" ? "email" : "sms",
      direction,
      subject: row.subject,
      body: row.body,
      sent_at: row.sent_at,
      read: row.read,
      translationEn: row.translation_en,
      intent: row.intent,
      priority: row.priority,
      sentBy: direction === "outbound" ? (row.sent_by ?? null) : null,
    };
    const unread = !message.read && message.direction === "inbound" ? 1 : 0;

    const existing = byKey.get(key);
    if (existing) {
      existing.messages.push(message);
      existing.lastMessage = message;
      existing.unreadCount += unread;
      continue;
    }
    byKey.set(key, {
      key,
      clientId: row.client_id ?? null,
      contactAddress: client ? null : contactAddress,
      clientName: client
        ? [client.first_name, client.last_name].filter(Boolean).join(" ") || unknownLabel
        : (contactAddress ?? unknownLabel),
      clientEmail: client ? client.email : isEmailAddr ? contactAddress : null,
      clientPhone: client ? client.phone : isEmailAddr ? null : contactAddress,
      lastMessage: message,
      unreadCount: unread,
      messages: [message],
      consent: null,
    });
  }

  return [...byKey.values()].sort(
    (a, b) => new Date(b.lastMessage.sent_at).getTime() - new Date(a.lastMessage.sent_at).getTime(),
  );
}

// ─── The list ─────────────────────────────────────────────────────────────────

/**
 * Conversations with ANY message on the channel. The filter used to look only
 * at the last message, so a client who texted after a long email exchange
 * vanished from "Email".
 */
export function filterThreads(threads: InboxThread[], filter: ChannelFilter): InboxThread[] {
  if (filter === "all") return threads;
  return threads.filter((t) => t.messages.some((m) => m.channel === filter));
}

/** The message a list row previews: the latest one on the filtered channel. */
export function previewMessage(thread: InboxThread, filter: ChannelFilter): InboxMessage {
  if (filter === "all") return thread.lastMessage;
  for (let i = thread.messages.length - 1; i >= 0; i--) {
    if (thread.messages[i].channel === filter) return thread.messages[i];
  }
  return thread.lastMessage;
}

/** "Auto Pilot: " before an outbound preview; nothing before an inbound one. */
export function previewPrefix(message: InboxMessage, t: Translate): string {
  return message.direction === "outbound" ? t("list.previewFrom", { sender: senderLabel(message.sentBy, t) }) : "";
}

// ─── Replying ─────────────────────────────────────────────────────────────────

export type ChannelState =
  | { channel: Channel; available: true; to: string }
  | { channel: Channel; available: false; why: "no_address" }
  | { channel: Channel; available: false; why: "opted_out"; optOut: ChannelOptOut };

/** Can this conversation be replied to on this channel, and if not, why not. */
export function channelState(thread: InboxThread, channel: Channel): ChannelState {
  const to = (channel === "sms" ? thread.clientPhone : thread.clientEmail)?.trim();
  if (!to) return { channel, available: false, why: "no_address" };
  const optOut = thread.consent?.[channel];
  if (optOut?.optedOut) return { channel, available: false, why: "opted_out", optOut };
  return { channel, available: true, to };
}

const other = (c: Channel): Channel => (c === "sms" ? "email" : "sms");

/**
 * The channel the reply box opens on: the one they last wrote on when it can
 * be used, else the other one. When neither can, the one that at least has an
 * address — so the reason shown is the opt-out, not a missing number.
 */
export function defaultReplyChannel(thread: InboxThread): Channel {
  const last = thread.lastMessage.channel;
  if (channelState(thread, last).available) return last;
  if (channelState(thread, other(last)).available) return other(last);
  const lastState = channelState(thread, last);
  if (!lastState.available && lastState.why === "opted_out") return last;
  const otherState = channelState(thread, other(last));
  if (!otherState.available && otherState.why === "opted_out") return other(last);
  return last;
}

/** Channels that have an address at all — the ones worth offering a choice between. */
export function addressedChannels(thread: InboxThread): Channel[] {
  return (["sms", "email"] as const).filter((c) => {
    const s = channelState(thread, c);
    return s.available || s.why !== "no_address";
  });
}

function shortDate(iso: string, locale: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(intlLocale(locale), { month: "short", day: "numeric" });
}

/**
 * One line of opt-out state — "Opted out of texts since Sep 3 · replied STOP".
 * Null for an open channel.
 */
export function optOutLine(channel: Channel, optOut: ChannelOptOut | undefined, t: Translate, locale: string): string | null {
  if (!optOut?.optedOut) return null;
  const date = optOut.since ? shortDate(optOut.since, locale) : null;
  if (channel === "sms") {
    if (date && optOut.via === "stop_reply") return t("consent.sms.stopReply", { date });
    if (date && optOut.via === "carrier") return t("consent.sms.carrier", { date });
    if (date) return t("consent.sms.since", { date });
    return t("consent.sms.marked");
  }
  return date ? t("consent.email.since", { date }) : t("consent.email.marked");
}

/** Every opt-out on the conversation, for the thread header. */
export function consentLines(thread: InboxThread, t: Translate, locale: string): string[] {
  if (!thread.consent) return [];
  return (["sms", "email"] as const)
    .map((c) => optOutLine(c, thread.consent?.[c], t, locale))
    .filter((line): line is string => !!line);
}

/**
 * Why the reply box is disabled, or null when it is not. The whole
 * conversation having no address outranks either channel's own reason.
 */
export function blockedReason(thread: InboxThread, channel: Channel, t: Translate, locale: string): string | null {
  if (addressedChannels(thread).length === 0) return t("thread.blocked.noAddress");
  const state = channelState(thread, channel);
  if (state.available) return null;
  if (state.why === "no_address") return channel === "sms" ? t("thread.blocked.noPhone") : t("thread.blocked.noEmail");
  const reason = optOutLine(channel, state.optOut, t, locale) ?? "";
  return channel === "sms"
    ? t("thread.blocked.optedOutSms", { reason })
    : t("thread.blocked.optedOutEmail", { reason });
}

const REPLY_PREFIX = /^\s*(?:re|aw|sv|回复|答复)\s*[:：]\s*/i;

/**
 * The subject of an email reply, in the owner's language: "Re: Kitchen quote",
 * "回复：Kitchen quote". Taken from the latest email in the conversation with
 * one, and never stacked into "Re: Re: Re:".
 */
export function replySubject(thread: InboxThread, t: Translate): string {
  let subject = "";
  for (let i = thread.messages.length - 1; i >= 0; i--) {
    const m = thread.messages[i];
    if (m.channel === "email" && m.subject?.trim()) {
      subject = m.subject.trim();
      break;
    }
  }
  while (REPLY_PREFIX.test(subject)) subject = subject.replace(REPLY_PREFIX, "");
  return subject ? t("thread.replySubject", { subject }) : t("compose.noSubject");
}

// ─── Arriving from elsewhere ──────────────────────────────────────────────────

/**
 * "Send email" on a client's page links to `/inbox?compose=<client id>`, which
 * the inbox never read — the button landed on an inbox with nothing open. Links
 * written before carried the email address, so an address still resolves, to
 * the client on this organization's list who has it. Anything else opens
 * nothing rather than a compose box addressed to a guess.
 */
export function composeTarget(
  param: string | null | undefined,
  clients: Array<{ id: string; email: string | null }>,
): { clientId: string; channel: Channel } | null {
  const value = param?.trim();
  if (!value) return null;
  const match =
    clients.find((c) => c.id === value) ??
    clients.find((c) => !!c.email && c.email.trim().toLowerCase() === value.toLowerCase());
  return match ? { clientId: match.id, channel: "email" } : null;
}
