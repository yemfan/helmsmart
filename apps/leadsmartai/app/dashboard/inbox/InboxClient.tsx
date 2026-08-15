"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";

type Thread = {
  leadId: string;
  channel: "sms" | "email";
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
};

type LeadInfo = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  rating: string | null;
  property_address: string | null;
};

const CHANNEL_ICON: Record<string, string> = { sms: "💬", email: "✉️" };

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
  const [filter, setFilter] = useState<"all" | "unread" | "sms" | "email">("all");
  const [search, setSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState<{ leadId: string; channel: string } | null>(null);
  const [lead, setLead] = useState<LeadInfo | null>(null);
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/inbox");
      const body = await res.json().catch(() => ({}));
      if (body.ok) setThreads(body.threads ?? []);
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadThreads(); const i = setInterval(loadThreads, 15000); return () => clearInterval(i); }, [loadThreads]);

  async function loadThread(leadId: string, channel: string) {
    setThreadLoading(true);
    setSelectedLead({ leadId, channel });
    setReplyText("");
    setSendMsg(null);
    try {
      const res = await fetch(`/api/dashboard/inbox/thread?leadId=${leadId}&channel=all`);
      const body = await res.json().catch(() => ({}));
      if (body.ok) {
        setLead(body.lead);
        setMessages(body.messages ?? []);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      }
    } catch { /* silent */ } finally { setThreadLoading(false); }
  }

  async function sendReply() {
    if (!replyText.trim() || !selectedLead || !lead) return;
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

  const filtered = threads.filter((t) => {
    if (filter === "unread" && t.lastDirection !== "inbound") return false;
    if (filter === "sms" && t.channel !== "sms") return false;
    if (filter === "email" && t.channel !== "email") return false;
    if (search.trim()) {
      const s = search.toLowerCase();
      if (!(t.leadName ?? "").toLowerCase().includes(s) && !t.preview.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const unreadCount = threads.filter((t) => t.lastDirection === "inbound").length;

  if (loading) return <div className="py-20 text-center text-gray-400">{t("inbox.loading")}</div>;

  return (
    <div className="flex h-[calc(100vh-140px)] min-h-[500px] rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Left panel — conversation list */}
      <div className="w-full max-w-sm shrink-0 flex flex-col border-r border-gray-200">
        <div className="shrink-0 border-b border-gray-100 p-3 space-y-2">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">
                {t("inbox.heading")}
                {unreadCount > 0 && <span className="ml-2 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white">{unreadCount}</span>}
              </h2>
            </div>
            <p className="mt-0.5 text-[11px] text-gray-500">{t("inbox.subheading")}</p>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("inbox.searchPlaceholder")}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm"
          />
          <div className="flex gap-1">
            {(["all", "unread", "sms", "email"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium ${filter === f ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
              >
                {/* Rendering `f` directly printed the raw key — the same way the
                    Playbooks "all" tab did. Every key is translated explicitly. */}
                {f === "unread"
                  ? t("inbox.filterUnread", { count: unreadCount })
                  : f === "sms"
                    ? t("inbox.filterSms")
                    : f === "email"
                      ? t("inbox.filterEmail")
                      : t("inbox.filterAll")}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-400">
              {search ? t("inbox.emptySearch") : t("inbox.empty")}
            </div>
          ) : (
            filtered.map((t) => {
              const isSelected = selectedLead?.leadId === t.leadId && selectedLead?.channel === t.channel;
              const isUnread = t.lastDirection === "inbound";
              return (
                <button
                  key={`${t.leadId}-${t.channel}`}
                  type="button"
                  onClick={() => loadThread(t.leadId, t.channel)}
                  className={`w-full text-left px-3 py-3 border-b border-gray-50 transition ${isSelected ? "bg-blue-50" : "hover:bg-gray-50"}`}
                >
                  <div className="flex items-start gap-2">
                    <span className="shrink-0 text-sm mt-0.5">{CHANNEL_ICON[t.channel] ?? "💬"}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm truncate ${isUnread ? "font-semibold text-gray-900" : "font-medium text-gray-700"}`}>
                          {t.leadName ?? tr("inbox.leadFallback", { id: t.leadId })}
                        </span>
                        <span className="shrink-0 text-[10px] text-gray-400">{timeAgo(t.lastMessageAt, tr, locale)}</span>
                      </div>
                      <p className={`text-xs truncate mt-0.5 ${isUnread ? "text-gray-700" : "text-gray-500"}`}>
                        {t.lastDirection === "outbound" && <span className="text-gray-400">{tr("inbox.youPrefix")}</span>}
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
      <div className="flex min-w-0 flex-1 flex-col">
        {!selectedLead ? (
          <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
            {t("inbox.selectPrompt")}
          </div>
        ) : threadLoading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-gray-400">{t("inbox.threadLoading")}</div>
        ) : (
          <>
            {/* Thread header */}
            <div className="shrink-0 border-b border-gray-100 px-4 py-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">{lead?.name ?? t("inbox.leadFallback", { id: selectedLead.leadId })}</h3>
                <p className="text-xs text-gray-500">
                  {lead?.phone && <span className="mr-3">{lead.phone}</span>}
                  {lead?.email && <span className="mr-3">{lead.email}</span>}
                  {lead?.rating && (
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${lead.rating === "hot" ? "bg-red-100 text-red-700" : lead.rating === "warm" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
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
              <button onClick={() => setSelectedLead(null)} className="text-xs text-gray-400 hover:text-gray-700 lg:hidden">{t("inbox.close")}</button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">{t("inbox.noMessages")}</p>
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
                          <div className="text-center text-[10px] text-gray-400 py-2">{formatDate(m.created_at, locale)}</div>
                        )}
                        <div className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${isOutbound ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-900"}`}>
                            {m.subject && <p className="text-[10px] font-semibold opacity-70 mb-0.5">{m.subject}</p>}
                            <p className="text-sm whitespace-pre-wrap">{m.message}</p>
                            <div className={`flex items-center gap-1.5 mt-1 ${isOutbound ? "justify-end" : ""}`}>
                              <span className="text-[10px] opacity-50">{CHANNEL_ICON[m.channel] ?? ""}</span>
                              <span className="text-[10px] opacity-50">{formatTime(m.created_at, locale)}</span>
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
            <div className="shrink-0 border-t border-gray-100 p-3">
              {sendMsg && (
                <p className={`text-xs mb-2 ${sendMsg.ok ? "text-green-700" : "text-red-600"}`}>
                  {sendMsg.text}
                </p>
              )}
              <div className="flex gap-2">
                <input
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendReply(); } }}
                  placeholder={selectedLead.channel === "email" ? t("inbox.replyEmail") : t("inbox.replySms")}
                  className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => void sendReply()}
                  disabled={sending || !replyText.trim()}
                  className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {sending ? t("inbox.sending") : t("inbox.send")}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
