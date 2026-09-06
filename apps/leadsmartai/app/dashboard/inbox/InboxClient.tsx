"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Mail, MessageSquare, Phone, Sparkles } from "lucide-react";

import { canEmailThread } from "@/lib/inbox/replyTarget";
import InboundEmailSetupButton from "@/components/dashboard/InboundEmailSetupButton";
import { intlLocale } from "@/lib/i18n/locale";

type Thread = {
  leadId: string;
  channel: "sms" | "email" | "call";
  leadName: string | null;
  preview: string;
  lastMessageAt: string;
  lastDirection: "inbound" | "outbound";
  isHotLead: boolean;
};

type Message = {
  id: string;
  message: string;
  subject?: string;
  direction: "inbound" | "outbound";
  channel: string;
  created_at: string;
  /** Calls only — length in seconds, rendered as m:ss beside the timestamp. */
  durationSeconds?: number | null;
  /** Calls only — completed, missed, no_answer, in_progress. */
  status?: string | null;
};

type LeadInfo = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  rating: string | null;
  property_address: string | null;
};

/** Channel glyph — the same icon family as the rest of the app, not emoji. */
function ChannelIcon({ channel, className }: { channel: string; className?: string }) {
  const cls = className ?? "h-3.5 w-3.5";
  if (channel === "email") return <Mail className={cls} strokeWidth={2} aria-hidden />;
  if (channel === "call") return <Phone className={cls} strokeWidth={2} aria-hidden />;
  return <MessageSquare className={cls} strokeWidth={2} aria-hidden />;
}

/** Call length as m:ss. Locale-neutral, so it needs no translated string. */
function callLength(seconds: number | null | undefined): string | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/**
 * These three used to hardcode "en-US", so a Chinese thread list still read
 " Mar 3" and "2:15 PM". They take the translator and locale now — module
 * scope means they cannot reach a hook themselves.
 */
type T = (k: string, o?: Record<string, unknown>) => string;

function timeAgo(iso: string, t: T, locale: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("inbox.now");
  if (mins < 60) return t("inbox.minutesAgo", { count: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t("inbox.hoursAgo", { count: hrs });
  const days = Math.floor(hrs / 24);
  if (days < 7) return t("inbox.daysAgo", { count: days });
  return new Date(iso).toLocaleDateString(locale, { month: "short", day: "numeric" });
}

function formatTime(iso: string, locale: string) {
  return new Date(iso).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
}

function formatDate(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" });
}

export default function InboxClient() {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  // The thread list maps over `t` (a Thread), which shadows the translator
  // inside that callback. `tr` is the same function under a name that survives.
  const tr = t;
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread" | "sms" | "email" | "call">("all");
  const [search, setSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState<{ leadId: string; channel: string } | null>(null);
  const [lead, setLead] = useState<LeadInfo | null>(null);
  /** Set when the thread LIST fails, so an error can't read as an empty inbox. */
  const [listError, setListError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  /**
   * The status used to BE the message, and the success styling compared it
   * against the literal "Sent!". Translating that string would have turned a
   * successful send red. The outcome is a flag now; the message is derived.
   */
  const [sendMsg, setSendMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [drafting, setDrafting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/inbox");
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.error ?? t("inbox.loadFailed"));
      setThreads(body.threads ?? []);
      setListError(null);
    } catch (e) {
      // An empty inbox and an inbox that failed to load looked identical: both
      // rendered the "no conversations yet" state. This polls every 15s, so a
      // blip self-heals -- but a persistent failure now says so instead of
      // telling the agent they have no messages.
      setListError(e instanceof Error ? e.message : t("inbox.loadFailed"));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadThreads(); const i = setInterval(loadThreads, 15000); return () => clearInterval(i); }, [loadThreads]);

  async function loadThread(leadId: string, channel: string) {
    setThreadLoading(true);
    setSelectedLead({ leadId, channel });
    setReplyText("");
    setSendMsg(null);
    /*
     * Clear the previous contact BEFORE fetching the next one.
     *
     * `lead` used to be assigned only inside `if (body.ok)`, so a failed load
     * left the PREVIOUSLY selected contact sitting in state while
     * `selectedLead` had already moved on. The email reply path reads
     * `lead.email` -- so a failed thread load followed by an email reply
     * addressed that reply to the contact the agent had been looking at
     * before, under the agent's own name. Stale identity is worse than no
     * identity, so it goes first and only comes back if the fetch proves it.
     */
    setLead(null);
    setMessages([]);
    try {
      const res = await fetch(`/api/dashboard/inbox/thread?leadId=${leadId}&channel=all`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok || !body.lead) {
        throw new Error(body.error ?? t("inbox.threadFailed"));
      }
      setLead(body.lead);
      setMessages(body.messages ?? []);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e) {
      setSendMsg({ ok: false, text: e instanceof Error ? e.message : t("inbox.threadFailed") });
    } finally { setThreadLoading(false); }
  }

  async function sendReply() {
    if (!replyText.trim() || !selectedLead) return;
    /*
     * This used to be part of the guard above: no `lead`, silent return. The
     * button is enabled whenever there is text, so the agent typed a reply,
     * pressed Send, and nothing happened at all -- no spinner, no error, the
     * text still sitting there. Say why instead.
     */
    if (!lead) {
      setSendMsg({ ok: false, text: t("inbox.threadFailed") });
      return;
    }
    setSending(true); setSendMsg(null);
    try {
      const channel = selectedLead.channel === "email" ? "email" : "sms";
      if (channel === "sms") {
        const res = await fetch("/api/ai-sms/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadId: selectedLead.leadId, message: replyText }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? t("inbox.sendFailed"));
      } else {
        /*
         * Only send to an address that belongs to the thread on screen. The
         * SMS path addresses by leadId and cannot drift; this one addresses by
         * a value held in separate state, so it checks that the two still
         * agree before putting the agent's name on a message.
         */
        if (!canEmailThread(lead, selectedLead.leadId)) {
          throw new Error(t("inbox.noEmailOnFile"));
        }
        const res = await fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: lead.email, subject: "Re: Follow up", text: replyText }),
        });
        if (!res.ok) throw new Error(t("inbox.sendFailed"));
      }
      setReplyText("");
      setSendMsg({ ok: true, text: t("inbox.sent") });
      // Reload thread
      await loadThread(selectedLead.leadId, selectedLead.channel);
    } catch (e) {
      setSendMsg({ ok: false, text: e instanceof Error ? e.message : t("inbox.sendFailed") });
    } finally { setSending(false); }
  }

  /**
   * "Draft with Max" — the per-contact drafting that used to live only in the
   * floating AI Guide bubble, now in the reply box where the reply is written.
   * Whatever the agent has typed becomes the brief; an empty box asks Max to
   * answer the latest inbound message.
   */
  async function draftWithMax() {
    if (!selectedLead || drafting) return;
    setDrafting(true);
    setSendMsg(null);
    try {
      const res = await fetch("/api/dashboard/sms/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: selectedLead.leadId,
          prompt: replyText.trim() || t("inbox.draftDefaultPrompt"),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.error ?? t("inbox.draftFailed"));
      setReplyText(String(body.draft ?? ""));
    } catch (e) {
      setSendMsg({ ok: false, text: e instanceof Error ? e.message : t("inbox.draftFailed") });
    } finally {
      setDrafting(false);
    }
  }

  const filtered = threads.filter((t) => {
    if (filter === "unread" && t.lastDirection !== "inbound") return false;
    if (filter === "sms" && t.channel !== "sms") return false;
    if (filter === "email" && t.channel !== "email") return false;
    if (filter === "call" && t.channel !== "call") return false;
    if (search.trim()) {
      const s = search.toLowerCase();
      if (!(t.leadName ?? "").toLowerCase().includes(s) && !t.preview.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const unreadCount = threads.filter((t) => t.lastDirection === "inbound").length;

  if (loading) return <div className="py-20 text-center text-slate-400">{t("inbox.loading")}</div>;

  return (
    <div className="space-y-2">
      {/* Gmail auto-import setup — a gear rather than a standing card,
          on the page where forwarded mail arrives. */}
      <div className="flex justify-end">
        <InboundEmailSetupButton />
      </div>

      {/* Two panes on lg+; ONE pane below it. The list and the thread used to
          share a 390px phone, which squeezed the list to a third of the width
          beside an empty "select a conversation" panel. */}
      <div className="flex h-[calc(100dvh-180px)] min-h-[500px] rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Left panel — conversation list */}
      <div className={`${selectedLead ? "hidden lg:flex" : "flex"} w-full shrink-0 flex-col border-r border-slate-200 lg:max-w-sm`}>
        <div className="shrink-0 border-b border-slate-100 p-3 space-y-2">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">
                {t("inbox.heading")}
                {unreadCount > 0 && <span className="ml-2 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white">{unreadCount}</span>}
              </h2>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500">{t("inbox.subheading")}</p>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("inbox.searchPlaceholder")}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm"
          />
          <div className="flex gap-1">
            {(["all", "unread", "sms", "email", "call"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium ${filter === f ? "bg-[#0072ce] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                {/* Rendering `f` directly printed the raw key — the same way the
                    Playbooks "all" tab did. Every key is translated explicitly. */}
                {f === "unread"
                  ? t("inbox.filterUnread", { count: unreadCount })
                  : f === "sms"
                    ? t("inbox.filterSms")
                    : f === "email"
                      ? t("inbox.filterEmail")
                      : f === "call"
                        ? t("inbox.filterCall")
                        : t("inbox.filterAll")}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            listError && !search ? (
              // Grey "no conversations yet" is what an agent sees when nobody
              // has written to them. It must not also be what they see when
              // the inbox failed to load -- one is good news about a quiet
              // day, the other is the app not working.
              <div
                role="alert"
                className="m-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
              >
                {listError}
              </div>
            ) : (
              <div className="p-6 text-center text-sm text-slate-400">
                {search ? t("inbox.emptySearch") : t("inbox.empty")}
              </div>
            )
          ) : (
            filtered.map((t) => {
              const isSelected = selectedLead?.leadId === t.leadId && selectedLead?.channel === t.channel;
              const isUnread = t.lastDirection === "inbound";
              return (
                <button
                  key={`${t.leadId}-${t.channel}`}
                  type="button"
                  onClick={() => loadThread(t.leadId, t.channel)}
                  className={`w-full text-left px-3 py-3 border-b border-slate-50 transition ${isSelected ? "bg-blue-50" : "hover:bg-slate-50"}`}
                >
                  <div className="flex items-start gap-2">
                    <span className="shrink-0 mt-1 text-slate-400"><ChannelIcon channel={t.channel} className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm truncate ${isUnread ? "font-semibold text-slate-900" : "font-medium text-slate-700"}`}>
                          {t.leadName ?? tr("inbox.leadFallback", { id: t.leadId })}
                        </span>
                        <span className="shrink-0 text-[10px] text-slate-400">{timeAgo(t.lastMessageAt, tr, locale)}</span>
                      </div>
                      <p className={`text-xs truncate mt-0.5 ${isUnread ? "text-slate-700" : "text-slate-500"}`}>
                        {t.lastDirection === "outbound" && <span className="text-slate-400">{tr("inbox.youPrefix")}</span>}
                        {t.preview}
                      </p>
                    </div>
                    {isUnread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600" />}
                    {t.isHotLead && <span className="mt-1 text-[10px]">🔥</span>}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right panel — thread detail */}
      <div className={`${selectedLead ? "flex" : "hidden lg:flex"} min-w-0 flex-1 flex-col`}>
        {!selectedLead ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
            {t("inbox.selectPrompt")}
          </div>
        ) : threadLoading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">{t("inbox.threadLoading")}</div>
        ) : (
          <>
            {/* Thread header */}
            <div className="shrink-0 border-b border-slate-100 px-3 py-2.5 flex items-center gap-2 sm:px-4">
              <button
                type="button"
                onClick={() => setSelectedLead(null)}
                aria-label={t("inbox.close")}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 lg:hidden"
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold text-slate-900">{lead?.name ?? t("inbox.leadFallback", { id: selectedLead.leadId })}</h3>
                <p className="text-xs text-slate-500">
                  {lead?.phone && <span className="mr-3">{lead.phone}</span>}
                  {lead?.email && <span className="mr-3">{lead.email}</span>}
                  {lead?.rating && (
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${lead.rating === "hot" ? "bg-red-100 text-red-700" : lead.rating === "warm" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                      {/* A DB enum, shown raw. */}
                      {t(
                        lead.rating === "hot"
                          ? "inbox.ratingHot"
                          : lead.rating === "warm"
                            ? "inbox.ratingWarm"
                            : "inbox.ratingCold",
                      )}
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.length === 0 ? (
                <p className="text-center text-sm text-slate-400 py-8">{t("inbox.noMessages")}</p>
              ) : (
                <>
                  {messages.map((m, i) => {
                    const isOutbound = m.direction === "outbound";
                    const showDate =
                      i === 0 ||
                      formatDate(m.created_at, locale) !== formatDate(messages[i - 1].created_at, locale);
                    return (
                      <div key={m.id}>
                        {showDate && (
                          <div className="text-center text-[10px] text-slate-400 py-2">{formatDate(m.created_at, locale)}</div>
                        )}
                        <div className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${isOutbound ? "bg-[#0072ce] text-white" : "bg-slate-100 text-slate-900"}`}>
                            {m.subject && <p className="text-[10px] font-semibold opacity-70 mb-0.5">{m.subject}</p>}
                            <p className="text-sm whitespace-pre-wrap">{m.message}</p>
                            <div className={`flex items-center gap-1.5 mt-1 ${isOutbound ? "justify-end" : ""}`}>
                              <span className="opacity-50"><ChannelIcon channel={m.channel} className="h-3 w-3" /></span>
                              <span className="text-[10px] opacity-50">{formatTime(m.created_at, locale)}</span>
                              {/* Only calls have a length; m:ss needs no translation. */}
                              {callLength(m.durationSeconds) && (
                                <span className="text-[10px] opacity-50">{callLength(m.durationSeconds)}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Reply box */}
            <div className="shrink-0 border-t border-slate-100 p-3">
              {sendMsg && (
                <p className={`text-xs mb-2 ${sendMsg.ok ? "text-green-700" : "text-red-600"}`}>
                  {sendMsg.text}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <input
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendReply(); } }}
                  placeholder={selectedLead.channel === "email" ? t("inbox.replyEmail") : t("inbox.replySms")}
                  aria-label={selectedLead.channel === "email" ? t("inbox.replyEmail") : t("inbox.replySms")}
                  className="min-w-0 flex-1 basis-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm sm:basis-auto"
                />
                <button
                  type="button"
                  onClick={() => void draftWithMax()}
                  disabled={drafting || sending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-[#0072ce] hover:bg-blue-100 disabled:opacity-50"
                >
                  <Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden />
                  {drafting ? t("inbox.drafting") : t("inbox.draftWithMax")}
                </button>
                <button
                  type="button"
                  onClick={() => void sendReply()}
                  disabled={sending || !replyText.trim()}
                  className="rounded-lg bg-[#0072ce] px-4 py-2 text-sm font-medium text-white hover:bg-[#005ca8] disabled:opacity-50"
                >
                  {sending ? t("inbox.sending") : t("inbox.send")}
                </button>
              </div>
            </div>
          </>
        )}
        </div>
      </div>
    </div>
  );
}
