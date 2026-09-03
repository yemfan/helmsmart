"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { MessageSquarePlus, Send, Mail, MessageSquare, RefreshCw, Sparkles, UserPlus } from "lucide-react";
import { markThreadRead, sendEmail, sendSms, draftReply, createClientFromConversation } from "@/lib/actions/messages";
import { InboxCompose } from "./inbox-compose";
import { InboxForwardingAddress } from "./inbox-forwarding-address";
import { browserConnForHost } from "@/lib/pack-host";

type Channel = "all" | "email" | "sms";

interface Message {
  id: string;
  channel: "email" | "sms";
  direction: "inbound" | "outbound";
  subject: string | null;
  body: string;
  sent_at: string;
  read: boolean;
  translationEn: string | null;
  intent: string | null;
  priority: string | null;
}

interface Thread {
  key: string;
  clientId: string | null;
  contactAddress: string | null;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  lastMessage: Message;
  unreadCount: number;
  messages: Message[];
}

interface Client {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
}

interface Props {
  threads: Thread[];
  clients: Client[];
  orgId: string;
  /** Where to forward a mailbox, or null when inbound email is not configured. */
  inboundAddress: string | null;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
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

export function InboxClient({ threads: initialThreads, clients, orgId, inboundAddress }: Props) {
  const router = useRouter();
  const [threads, setThreads] = useState(initialThreads);
  const [channel, setChannel] = useState<Channel>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(
    initialThreads[0]?.key ?? null
  );
  const [composing, setComposing] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [addingClient, setAddingClient] = useState(false);
  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when thread changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedKey]);

  // Keep local threads in sync when the server re-renders (e.g. after router.refresh()).
  useEffect(() => {
    setThreads(initialThreads);
  }, [initialThreads]);

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

  const filtered = threads.filter(
    (t) => channel === "all" || t.lastMessage.channel === channel
  );
  const selected = threads.find((t) => t.key === selectedKey);
  const totalUnread = threads.reduce((s, t) => s + t.unreadCount, 0);

  function selectThread(key: string) {
    setSelectedKey(key);
    const t = threads.find((x) => x.key === key);
    // Mark read optimistically
    setThreads((prev) =>
      prev.map((x) => (x.key === key ? { ...x, unreadCount: 0 } : x))
    );
    startTransition(() => markThreadRead(t?.clientId ?? null, t?.contactAddress ?? null));
  }

  function sendReply() {
    if (!selected || !replyBody.trim()) return;
    const body = replyBody.trim();
    setReplyBody("");

    startTransition(async () => {
      if (selected.lastMessage.channel === "email" && selected.clientEmail) {
        await sendEmail(selected.clientId, selected.clientEmail, "Re: " + (selected.lastMessage.subject ?? ""), body);
      } else if (selected.clientPhone) {
        await sendSms(selected.clientId, selected.clientPhone, body);
      }
      // Optimistically append the message
      const newMsg: Message = {
        id: crypto.randomUUID(),
        channel: selected.lastMessage.channel,
        direction: "outbound",
        subject: null,
        body,
        sent_at: new Date().toISOString(),
        read: true,
        translationEn: null,
        intent: null,
        priority: null,
      };
      setThreads((prev) =>
        prev.map((t) =>
          t.key === selected.key
            ? { ...t, lastMessage: newMsg, messages: [...t.messages, newMsg] }
            : t
        )
      );
    });
  }

  async function handleDraft() {
    if (!selected) return;
    setDrafting(true);
    try {
      const draft = await draftReply(selected.clientId, selected.lastMessage.channel, selected.contactAddress);
      if (draft) setReplyBody(draft);
    } catch {
      // ignore — leave the reply box as-is
    } finally {
      setDrafting(false);
    }
  }

  async function addAsClient() {
    if (!selected || !selected.contactAddress) return;
    const isEmail = selected.contactAddress.includes("@");
    setAddingClient(true);
    const res = await createClientFromConversation({
      address: selected.contactAddress,
      channel: isEmail ? "email" : "sms",
      firstName: deriveClientName(selected.contactAddress),
    });
    setAddingClient(false);
    if (!res.error) {
      if (res.clientId) setSelectedKey(res.clientId);
      router.refresh();
    }
  }

  return (
    <>
      {composing && (
        <InboxCompose
          clients={clients}
          onClose={() => setComposing(false)}
          onSent={() => {
            setComposing(false);
            router.refresh();
          }}
        />
      )}

      <div className="flex h-full">
        {/* ── Thread list ── */}
        <div className="w-80 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col">
          <div className="px-4 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-slate-800">Inbox</h1>
              {totalUnread > 0 && (
                <span className="text-xs font-semibold bg-indigo-600 text-white rounded-full px-1.5 py-0.5 leading-none">
                  {totalUnread}
                </span>
              )}
            </div>
            <button
              onClick={() => setComposing(true)}
              className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              title="New conversation"
            >
              <MessageSquarePlus className="w-4 h-4 text-slate-500" />
            </button>
          </div>

          {/* Channel filter */}
          <div className="px-3 py-2 border-b border-slate-100 flex gap-1">
            {(["all", "sms", "email"] as Channel[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setChannel(tab)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  channel === tab
                    ? "bg-indigo-600 text-white"
                    : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                {tab === "all" ? "All" : tab.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Thread rows */}
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center p-8 mt-8">
                <MessageSquare className="w-8 h-8 text-slate-300 mb-2" />
                <p className="text-xs font-medium text-slate-500 mb-1">No messages yet</p>
                <p className="text-xs text-slate-400">
                  Client SMS and emails will appear here.
                </p>
              </div>
            ) : (
              filtered.map((t) => (
                <button
                  key={t.key}
                  onClick={() => selectThread(t.key)}
                  className={`w-full text-left px-4 py-3.5 border-b border-slate-50 hover:bg-slate-50 transition-colors ${
                    selectedKey === t.key ? "bg-indigo-50" : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 text-xs font-semibold text-indigo-600">
                      {(t.clientName[0] ?? "?").toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className={`text-sm ${t.unreadCount > 0 ? "font-semibold text-slate-900" : "font-medium text-slate-700"}`}>
                          {t.clientName}
                        </span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {t.unreadCount > 0 && (
                            <span className="w-2 h-2 rounded-full bg-indigo-600" />
                          )}
                          <span className="text-xs text-slate-400">{timeAgo(t.lastMessage.sent_at)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {t.lastMessage.channel === "sms"
                          ? <MessageSquare className="w-3 h-3 text-slate-400 flex-shrink-0" />
                          : <Mail className="w-3 h-3 text-slate-400 flex-shrink-0" />
                        }
                        <p className="text-xs text-slate-500 truncate">
                          {t.lastMessage.direction === "outbound" ? "You: " : ""}
                          {t.lastMessage.body}
                        </p>
                      </div>
                      {(t.lastMessage.priority === "high" || (t.lastMessage.intent && t.lastMessage.intent !== "other")) && (
                        <div className="flex items-center gap-1 mt-1">
                          {t.lastMessage.priority === "high" && (
                            <span className="text-[10px] font-semibold text-rose-600 bg-rose-50 rounded px-1.5 py-0.5">Urgent</span>
                          )}
                          {t.lastMessage.intent && t.lastMessage.intent !== "other" && (
                            <span className="text-[10px] font-medium text-slate-500 bg-slate-100 rounded px-1.5 py-0.5 capitalize">{t.lastMessage.intent}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              ))
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
          <div className="flex-1 flex flex-col bg-slate-50">
            {/* Thread header */}
            <div className="px-6 py-4 bg-white border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-800">{selected.clientName}</h2>
                <p className="text-xs text-slate-400">
                  {selected.lastMessage.channel === "email" ? selected.clientEmail : selected.clientPhone}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {!selected.clientId && selected.contactAddress && (
                  <button
                    onClick={addAsClient}
                    disabled={addingClient}
                    className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50 transition-colors"
                    title="Create a client from this conversation"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    {addingClient ? "Adding…" : "Add as client"}
                  </button>
                )}
                <div className="flex items-center gap-2">
                  {selected.lastMessage.channel === "email"
                    ? <Mail className="w-4 h-4 text-slate-400" />
                    : <MessageSquare className="w-4 h-4 text-slate-400" />
                  }
                  <span className="text-xs text-slate-400 capitalize">{selected.lastMessage.channel}</span>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {selected.messages.map((msg) => {
                const isOut = msg.direction === "outbound";
                return (
                  <div key={msg.id} className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-sm rounded-2xl px-4 py-2.5 ${
                      isOut
                        ? "bg-indigo-600 text-white rounded-br-sm"
                        : "bg-white text-slate-800 border border-slate-200 rounded-bl-sm"
                    }`}>
                      {msg.subject && !isOut && (
                        <p className="text-xs font-semibold mb-1 text-slate-500">{msg.subject}</p>
                      )}
                      <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                      {!isOut && msg.translationEn && (
                        <p className="text-xs mt-1.5 pt-1.5 border-t border-slate-200/70 text-slate-500 italic whitespace-pre-wrap">
                          EN: {msg.translationEn}
                        </p>
                      )}
                      <p className={`text-xs mt-1 ${isOut ? "text-indigo-200" : "text-slate-400"}`}>
                        {timeAgo(msg.sent_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Reply box */}
            <div className="px-6 py-4 bg-white border-t border-slate-200">
              <div className="flex items-center justify-end mb-2">
                <button
                  onClick={handleDraft}
                  disabled={drafting || isPending}
                  className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {drafting ? "Drafting…" : "Draft with AI"}
                </button>
              </div>
              <div className="flex items-end gap-3">
                <textarea
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendReply();
                  }}
                  rows={2}
                  placeholder={`Reply via ${selected.lastMessage.channel}… (⌘↵ to send)`}
                  className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
                <button
                  onClick={sendReply}
                  disabled={isPending || !replyBody.trim()}
                  className="flex-shrink-0 p-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
                >
                  {isPending ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center bg-slate-50 p-8">
            <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center mb-3">
              <MessageSquarePlus className="w-5 h-5 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-600 mb-1">Select a conversation</p>
            <p className="text-xs text-slate-400 max-w-xs">
              Reply to client SMS and emails from one unified inbox.
            </p>
            <button
              onClick={() => setComposing(true)}
              className="mt-4 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              New message
            </button>
          </div>
        )}
      </div>
    </>
  );
}
