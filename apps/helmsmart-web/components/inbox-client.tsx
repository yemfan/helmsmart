"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@leadsmart/i18n";
import { createBrowserClient } from "@supabase/ssr";
import { ArrowLeft, MessageSquarePlus, Send, Mail, MessageSquare, RefreshCw, Sparkles, UserPlus } from "lucide-react";
import { markThreadRead, sendEmail, sendSms, draftReply, createClientFromConversation } from "@/lib/actions/messages";
import { senderLabel } from "@/lib/message-provenance";
import {
  addressedChannels,
  blockedReason,
  channelState,
  consentLines,
  defaultReplyChannel,
  filterThreads,
  previewMessage,
  previewPrefix,
  replySubject,
  type Channel,
  type ChannelFilter,
  type InboxThread,
} from "@/lib/inbox/threads";
import { appendMessage, setUnread, settleSend, type ReplyDraft } from "@/lib/inbox/reply";
import { InboxCompose } from "./inbox-compose";
import { InboxForwardingAddress } from "./inbox-forwarding-address";
import { browserConnForHost } from "@/lib/pack-host";

interface Client {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
}

interface Props {
  threads: InboxThread[];
  clients: Client[];
  orgId: string;
  /** Where to forward a mailbox, or null when inbound email is not configured. */
  inboundAddress: string | null;
  /** "Send email" on a client's page: open the compose box with that client chosen. */
  initialCompose: { clientId: string; channel: Channel } | null;
}

type Translate = (key: string, opts?: Record<string, unknown>) => string;

function timeAgo(iso: string, t: Translate, language: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return t("list.time.justNow");
  if (m < 60) return t("list.time.minutesAgo", { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("list.time.hoursAgo", { n: h });
  return new Date(iso).toLocaleDateString(intlLocale(language), { month: "short", day: "numeric" });
}

/** Guess a client name from an email/phone when creating one from a thread. */
function deriveClientName(address: string): string {
  if (!address.includes("@")) return address;
  const local = address.split("@")[0];
  const parts = local.split(/[._-]+/).filter(Boolean);
  return parts.length
    ? parts.map((p) => p[0].toUpperCase() + p.slice(1)).join(" ")
    : local;
}

/** The current URL with some query params set or removed. */
function urlWith(params: Record<string, string | null>): string {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(params)) {
    if (v === null) url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  return url.pathname + url.search;
}

const EMPTY_DRAFT: ReplyDraft = { body: "", error: null };

export function InboxClient({ threads: initialThreads, clients, orgId, inboundAddress, initialCompose }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, i18n } = useTranslation("inbox");
  const [threads, setThreads] = useState(initialThreads);
  const [filter, setFilter] = useState<ChannelFilter>("all");
  const [composing, setComposing] = useState<{ clientId?: string; channel?: Channel } | null>(initialCompose);
  // What is typed in each conversation's reply box, and why its last send failed.
  const [drafts, setDrafts] = useState<Record<string, ReplyDraft>>({});
  const [replyChannels, setReplyChannels] = useState<Record<string, Channel>>({});
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<{ key: string; message: string } | null>(null);
  const [addingClient, setAddingClient] = useState(false);
  const [addError, setAddError] = useState<{ key: string; message: string } | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  // Set once this page pushes a conversation onto the history stack, so the
  // phone layout's back arrow pops it instead of leaving the inbox.
  const pushedThread = useRef(false);

  /*
   * The open conversation lives in the URL (?thread=…), so the browser's Back
   * button closes it on a phone. Below `md` the inbox is one pane at a time —
   * the list, or the conversation named here. Wider, an inbox with none named
   * shows the latest conversation beside the list, as it always has.
   */
  const openKey = searchParams.get("thread");
  const selectedKey = openKey ?? threads[0]?.key ?? null;
  const selected = threads.find((x) => x.key === selectedKey) ?? null;
  const threadOpenOnMobile = !!openKey && !!selected;

  // Scroll to bottom when thread changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedKey]);

  // Keep local threads in sync when the server re-renders (e.g. after router.refresh()).
  useEffect(() => {
    setThreads(initialThreads);
  }, [initialThreads]);

  /*
   * A conversation opened from its URL — a shared link, a reload, Back or
   * Forward — is read, the same as one tapped in the list, through the same
   * row-checked write. Once per opening: a refused write puts the dot back,
   * and must not retry itself on the re-render that causes.
   */
  const readOnOpen = useRef<string | null>(null);
  useEffect(() => {
    if (!openKey) {
      readOnOpen.current = null;
      return;
    }
    if (readOnOpen.current === openKey) return;
    const thread = threads.find((x) => x.key === openKey);
    if (!thread) return; // not in this page's threads yet — a refresh may bring it
    readOnOpen.current = openKey;
    markRead(thread);
    // markRead is recreated every render; openKey + threads are what decide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey, threads]);

  // Supabase Realtime — pull in new messages live, no manual refresh.
  useEffect(() => {
    if (!orgId) return;
    const conn = browserConnForHost(window.location.host);
    const supabase = createBrowserClient(conn.url, conn.key);
    const rtChannel = supabase
      .channel("inbox-messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `organization_id=eq.${orgId}` },
        () => router.refresh()
      )
      .subscribe();
    return () => { supabase.removeChannel(rtChannel); };
  }, [orgId, router]);

  const filtered = filterThreads(threads, filter);
  const totalUnread = threads.reduce((s, x) => s + x.unreadCount, 0);

  const draft = (selected && drafts[selected.key]) || EMPTY_DRAFT;
  const replyChannel: Channel | null = selected ? (replyChannels[selected.key] ?? defaultReplyChannel(selected)) : null;
  const blocked = selected && replyChannel ? blockedReason(selected, replyChannel, t, i18n.language) : null;
  const offered = selected ? addressedChannels(selected) : [];
  const headerLines = selected ? consentLines(selected, t, i18n.language) : [];

  function setDraft(key: string, next: ReplyDraft) {
    setDrafts((prev) => ({ ...prev, [key]: next }));
  }

  function selectThread(key: string) {
    if (key !== openKey) {
      window.history.pushState(null, "", urlWith({ thread: key, compose: null }));
      pushedThread.current = true;
    }
    readOnOpen.current = key;
    const thread = threads.find((x) => x.key === key);
    if (thread) markRead(thread);
  }

  /** Clear the unread dot now; put it back, and say why, if the write did not happen. */
  function markRead(thread: InboxThread) {
    if (thread.unreadCount === 0) return;
    const { key, unreadCount: before } = thread;
    setReadError(null);
    setThreads((prev) => setUnread(prev, key, 0));
    markThreadRead(thread.clientId, thread.contactAddress)
      .then((res) => {
        if (res.ok) return;
        setThreads((prev) => setUnread(prev, key, before));
        setReadError(res.error);
      })
      .catch((e) => {
        console.error("mark thread read", e);
        setThreads((prev) => setUnread(prev, key, before));
        setReadError(t("errors.markReadFailed"));
      });
  }

  function closeThread() {
    if (pushedThread.current) {
      pushedThread.current = false;
      window.history.back();
    } else {
      window.history.replaceState(null, "", urlWith({ thread: null }));
    }
  }

  function closeCompose() {
    setComposing(null);
    if (searchParams.get("compose")) window.history.replaceState(null, "", urlWith({ compose: null }));
  }

  function sendReply() {
    if (!selected || !replyChannel || isPending) return;
    const thread = selected;
    const channel = replyChannel;
    const body = (drafts[thread.key]?.body ?? "").trim();
    if (!body) return;
    const target = channelState(thread, channel);
    // The composer is disabled with the reason; there is nobody to send to.
    if (!target.available) return;
    const subject = channel === "email" ? replySubject(thread, t) : null;
    setDraft(thread.key, { body, error: null });

    startTransition(async () => {
      let outcome: Awaited<ReturnType<typeof sendSms>> | "unconfirmed";
      try {
        outcome =
          channel === "email"
            ? await sendEmail(thread.clientId, target.to, subject ?? "", body)
            : await sendSms(thread.clientId, target.to, body);
      } catch (e) {
        console.error("inbox reply", e);
        outcome = "unconfirmed";
        // If it did go, the refreshed conversation shows it.
        router.refresh();
      }
      // The text stays in the box until the server says it went; only a
      // confirmed send becomes a bubble.
      const settled = settleSend({ body, channel, subject }, outcome, t);
      setDraft(thread.key, settled.draft);
      if (settled.sent) setThreads((prev) => appendMessage(prev, thread.key, settled.message));
    });
  }

  async function handleDraft() {
    if (!selected || !replyChannel) return;
    const key = selected.key;
    setDrafting(true);
    setDraftError(null);
    try {
      const res = await draftReply(selected.clientId, replyChannel, selected.contactAddress);
      if (res.ok) setDraft(key, { body: res.text, error: null });
      else setDraftError({ key, message: res.error });
    } catch (e) {
      console.error("draft reply", e);
      setDraftError({ key, message: t("errors.draftFailed") });
    } finally {
      setDrafting(false);
    }
  }

  async function addAsClient() {
    if (!selected || !selected.contactAddress) return;
    const key = selected.key;
    const address = selected.contactAddress;
    setAddingClient(true);
    setAddError(null);
    let res: Awaited<ReturnType<typeof createClientFromConversation>>;
    try {
      res = await createClientFromConversation({
        address,
        channel: address.includes("@") ? "email" : "sms",
        firstName: deriveClientName(address),
      });
    } catch (e) {
      console.error("add as client", e);
      res = { error: t("errors.createClientFailed") };
    }
    setAddingClient(false);
    if (res.error || !res.clientId) {
      setAddError({ key, message: res.error ?? t("errors.createClientFailed") });
      return;
    }
    // The conversation is keyed by the client from now on; follow it.
    window.history.replaceState(null, "", urlWith({ thread: res.clientId }));
    router.refresh();
  }

  return (
    <>
      {composing && (
        <InboxCompose
          clients={clients}
          initialClientId={composing.clientId}
          initialChannel={composing.channel}
          onClose={closeCompose}
          onSent={() => {
            closeCompose();
            router.refresh();
          }}
        />
      )}

      <div className="flex h-full min-h-0">
        {/* ── Thread list ── full width on a phone, hidden while a conversation is open */}
        <div
          className={`${threadOpenOnMobile ? "hidden md:flex" : "flex"} w-full md:w-80 md:flex-shrink-0 min-w-0 border-r border-slate-200 bg-white flex-col`}
        >
          <div className="px-4 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-slate-800">{t("list.title")}</h1>
              {totalUnread > 0 && (
                <span className="text-xs font-semibold bg-indigo-600 text-white rounded-full px-1.5 py-0.5 leading-none">
                  {totalUnread}
                </span>
              )}
            </div>
            <button
              onClick={() => setComposing({})}
              className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              title={t("list.newConversation")}
              aria-label={t("list.newConversation")}
            >
              <MessageSquarePlus className="w-4 h-4 text-slate-500" />
            </button>
          </div>

          {/* Channel filter */}
          <div className="px-3 py-2 border-b border-slate-100 flex gap-1">
            {(["all", "sms", "email"] as ChannelFilter[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                aria-pressed={filter === tab}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  filter === tab
                    ? "bg-indigo-600 text-white"
                    : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                {tab === "all" ? t("list.filters.all") : tab === "sms" ? t("list.filters.sms") : t("list.filters.email")}
              </button>
            ))}
          </div>

          {readError && (
            <p className="px-4 py-2 text-xs text-rose-600 border-b border-slate-100" role="alert">{readError}</p>
          )}

          {/* Thread rows */}
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center p-8 mt-8">
                <MessageSquare className="w-8 h-8 text-slate-300 mb-2" />
                <p className="text-xs font-medium text-slate-500 mb-1">{t("list.empty.title")}</p>
                <p className="text-xs text-slate-400">
                  {t("list.empty.hint")}
                </p>
              </div>
            ) : (
              filtered.map((thread) => {
                const preview = previewMessage(thread, filter);
                const isSelected = selectedKey === thread.key;
                return (
                  <button
                    key={thread.key}
                    onClick={() => selectThread(thread.key)}
                    aria-current={isSelected ? "true" : undefined}
                    className={`w-full text-left px-4 py-3.5 border-b border-slate-50 hover:bg-slate-50 transition-colors ${
                      isSelected ? "md:bg-indigo-50" : ""
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 text-xs font-semibold text-indigo-600">
                        {(thread.clientName[0] ?? "?").toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className={`min-w-0 truncate text-sm ${thread.unreadCount > 0 ? "font-semibold text-slate-900" : "font-medium text-slate-700"}`}>
                            {thread.clientName}
                          </span>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {thread.unreadCount > 0 && (
                              <span className="w-2 h-2 rounded-full bg-indigo-600" />
                            )}
                            <span className="text-xs text-slate-400">{timeAgo(thread.lastMessage.sent_at, t, i18n.language)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {preview.channel === "sms"
                            ? <MessageSquare className="w-3 h-3 text-slate-400 flex-shrink-0" />
                            : <Mail className="w-3 h-3 text-slate-400 flex-shrink-0" />
                          }
                          <p className="text-xs text-slate-500 truncate">
                            {previewPrefix(preview, t)}
                            {preview.body}
                          </p>
                        </div>
                        {(thread.lastMessage.priority === "high" || (thread.lastMessage.intent && thread.lastMessage.intent !== "other")) && (
                          <div className="flex items-center gap-1 mt-1">
                            {thread.lastMessage.priority === "high" && (
                              <span className="text-[10px] font-semibold text-rose-600 bg-rose-50 rounded px-1.5 py-0.5">{t("badges.urgent")}</span>
                            )}
                            {thread.lastMessage.intent && thread.lastMessage.intent !== "other" && (
                              <span className="text-[10px] font-medium text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">
                                {t(`badges.intent.${thread.lastMessage.intent}`, { defaultValue: thread.lastMessage.intent })}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/*
            Where mail comes in, shown where mail arrives. This used to sit on
            the Settings page under "Integrations & webhooks", surrounded by
            Stripe and Twilio endpoints the owner cannot act on.
          */}
          {inboundAddress && <InboxForwardingAddress address={inboundAddress} />}
        </div>

        {/* ── Thread view ── */}
        {selected ? (
          <div className={`${threadOpenOnMobile ? "flex" : "hidden md:flex"} flex-1 min-w-0 flex-col bg-slate-50`}>
            {/* Thread header */}
            <div className="px-4 md:px-6 py-3 md:py-4 bg-white border-b border-slate-200 flex items-start gap-3">
              <button
                type="button"
                onClick={closeThread}
                className="md:hidden -ml-1 p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 flex-shrink-0"
                aria-label={t("thread.back")}
                title={t("thread.back")}
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold text-slate-800 truncate">{selected.clientName}</h2>
                <p className="text-xs text-slate-400 truncate">
                  {[selected.clientPhone, selected.clientEmail].filter(Boolean).join(" · ")}
                </p>
                {/* Who they can't be reached on, and since when — the same decision a send gets. */}
                {headerLines.map((line) => (
                  <p key={line} className="mt-0.5 text-xs text-amber-700">{line}</p>
                ))}
              </div>
              {!selected.clientId && selected.contactAddress && (
                <div className="flex-shrink-0 flex flex-col items-end max-w-[50%]">
                  <button
                    onClick={addAsClient}
                    disabled={addingClient}
                    className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50 transition-colors"
                    title={t("thread.addAsClientTitle")}
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    {addingClient ? t("common:status.adding") : t("thread.addAsClient")}
                  </button>
                  {addError?.key === selected.key && (
                    <p className="mt-1 text-right text-xs text-rose-600" role="alert">{addError.message}</p>
                  )}
                </div>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-3">
              {selected.messages.map((msg) => {
                const isOut = msg.direction === "outbound";
                const when = timeAgo(msg.sent_at, t, i18n.language);
                return (
                  <div key={msg.id} className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] md:max-w-sm min-w-0 rounded-2xl px-4 py-2.5 ${
                      isOut
                        ? "bg-indigo-600 text-white rounded-br-sm"
                        : "bg-white text-slate-800 border border-slate-200 rounded-bl-sm"
                    }`}>
                      {msg.subject && !isOut && (
                        <p className="text-xs font-semibold mb-1 text-slate-500">{msg.subject}</p>
                      )}
                      <p className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{msg.body}</p>
                      {!isOut && msg.translationEn && (
                        <p className="text-xs mt-1.5 pt-1.5 border-t border-slate-200/70 text-slate-500 italic whitespace-pre-wrap">
                          {t("thread.translationLabel")}: {msg.translationEn}
                        </p>
                      )}
                      {/* Who sent it — a person, Auto Pilot, a reminder — as quiet text. */}
                      <p className={`text-xs mt-1 ${isOut ? "text-indigo-200" : "text-slate-400"}`}>
                        {isOut ? t("thread.sentByTime", { sender: senderLabel(msg.sentBy, t), time: when }) : when}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Reply box */}
            <div className="px-4 md:px-6 py-3 md:py-4 bg-white border-t border-slate-200">
              <div className="flex items-center justify-between gap-3 mb-2">
                {offered.length > 1 ? (
                  <div role="group" aria-label={t("thread.replyVia")} className="flex gap-1">
                    {offered.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setReplyChannels((prev) => ({ ...prev, [selected.key]: c }))}
                        aria-pressed={replyChannel === c}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                          replyChannel === c ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-100"
                        }`}
                      >
                        {c === "sms" ? t("thread.channel.sms") : t("thread.channel.email")}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span />
                )}
                <button
                  onClick={handleDraft}
                  disabled={drafting || isPending || !!blocked}
                  className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {drafting ? t("common:status.drafting") : t("thread.draftWithAi")}
                </button>
              </div>
              <div className="flex items-end gap-3">
                <textarea
                  value={draft.body}
                  onChange={(e) => setDraft(selected.key, { ...draft, body: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendReply();
                  }}
                  disabled={!!blocked || isPending}
                  rows={2}
                  placeholder={replyChannel === "email" ? t("thread.replyPlaceholder.email") : t("thread.replyPlaceholder.sms")}
                  className="flex-1 min-w-0 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none disabled:bg-slate-50 disabled:text-slate-400"
                />
                <button
                  onClick={sendReply}
                  disabled={isPending || !!blocked || !draft.body.trim()}
                  aria-label={t("compose.send")}
                  className="flex-shrink-0 p-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
                >
                  {isPending ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
              {/* Why Send is off — no address, or they opted out on this channel. */}
              {blocked && <p className="mt-2 text-xs text-slate-600">{blocked}</p>}
              {draft.error && (
                <div className="mt-2 flex items-start gap-3">
                  <p className="flex-1 min-w-0 text-xs text-rose-600" role="alert">{draft.error}</p>
                  {!blocked && (
                    <button
                      type="button"
                      onClick={sendReply}
                      disabled={isPending || !draft.body.trim()}
                      className="flex-shrink-0 text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                    >
                      {t("common:actions.retry")}
                    </button>
                  )}
                </div>
              )}
              {draftError?.key === selected.key && (
                <p className="mt-2 text-xs text-rose-600" role="alert">{draftError.message}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="hidden md:flex flex-1 flex-col items-center justify-center text-center bg-slate-50 p-8">
            <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center mb-3">
              <MessageSquarePlus className="w-5 h-5 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-600 mb-1">{t("unselected.title")}</p>
            <p className="text-xs text-slate-400 max-w-xs">
              {t("unselected.hint")}
            </p>
            <button
              onClick={() => setComposing({})}
              className="mt-4 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              {t("unselected.newMessage")}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
