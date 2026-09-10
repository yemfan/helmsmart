"use client";

import { useEffect, useRef, useState } from "react";
import {
  fetchConversation,
  markConversationRead,
  sendSupportMessage,
  startSupportConversation,
  type SupportConversationDetail,
} from "@/lib/support-chat/api";
import { usePolling } from "@/lib/support-chat/polling";

function formatTime(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AssignedAgentChatDialog({
  open,
  onClose,
  agentAuthUserId,
  agentDisplayName,
  customerUserId,
}: {
  open: boolean;
  onClose: () => void;
  agentAuthUserId: string;
  agentDisplayName: string;
  /** Current logged-in user id (optional) */
  customerUserId: string | null;
}) {
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [conversationPublicId, setConversationPublicId] = useState("");
  const [starting, setStarting] = useState(false);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (typeof data.full_name === "string" && data.full_name.trim()) {
          setCustomerName(data.full_name.trim());
        }
        if (typeof data.email === "string" && data.email.includes("@")) {
          setCustomerEmail(data.email.trim().toLowerCase());
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setConversationPublicId("");
      setMessageInput("");
      setStarting(false);
      setSending(false);
    }
  }, [open]);

  const { data, isLoading, error, reload } = usePolling<{
    success: true;
    conversation: SupportConversationDetail | null;
  }>({
    enabled: Boolean(conversationPublicId) && open,
    intervalMs: 4000,
    fetcher: () => fetchConversation(conversationPublicId),
  });

  const conversation = data?.conversation ?? null;

  useEffect(() => {
    if (!conversationPublicId || !conversation?.messages?.length) return;
    void markConversationRead({
      conversationPublicId,
      readerType: "customer",
    });
  }, [conversationPublicId, conversation?.messages?.length]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [conversation?.messages?.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !starting && !sending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, starting, sending, onClose]);

  if (!open) return null;

  const canStart =
    customerName.trim().length >= 2 &&
    /.+@.+\..+/.test(customerEmail.trim()) &&
    messageInput.trim().length > 0;

  async function handleStart() {
    if (!canStart || starting) return;
    setStarting(true);
    try {
      const result = await startSupportConversation({
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim().toLowerCase(),
        subject: `Message for ${agentDisplayName}`,
        initialMessage: messageInput.trim(),
        source: "propertytools_assigned_agent",
        customerUserId,
        assignedAgentAuthUserId: agentAuthUserId,
        assignedAgentName: agentDisplayName,
        notifyAgentSms: true,
      });
      setConversationPublicId(result.conversation.publicId);
      setMessageInput("");
    } catch (e) {
      console.error(e);
    } finally {
      setStarting(false);
    }
  }

  async function handleSend() {
    if (!conversationPublicId || !messageInput.trim() || sending) return;
    setSending(true);
    try {
      await sendSupportMessage({
        conversationPublicId,
        senderType: "customer",
        senderName: customerName.trim() || undefined,
        senderEmail: customerEmail.trim().toLowerCase() || undefined,
        body: messageInput.trim(),
      });
      setMessageInput("");
      await reload();
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        aria-label="Close"
        onClick={() => !starting && !sending && onClose()}
      />
      <div className="relative flex min-h-0 max-h-[min(640px,90vh)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-2xl sm:max-h-[min(560px,85vh)]">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">Chat with {agentDisplayName}</p>
            <p className="text-xs text-slate-500">Messages sync with CloseBoss support.</p>
          </div>
          <button
            type="button"
            onClick={() => !starting && !sending && onClose()}
            className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close chat"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
        {!conversationPublicId && (
          <div className="grid shrink-0 gap-3 border-b border-slate-100 p-4 sm:grid-cols-2">
            <input
              className="rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
              placeholder="Your name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
            <input
              className="rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
              placeholder="Your email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
            />
          </div>
        )}

        <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
          {!conversationPublicId && (
            <p className="text-sm text-slate-600">Introduce yourself and send a first message. Your agent is notified according to your workspace SMS settings.</p>
          )}
          {conversation?.messages?.map((message) => {
            const isCustomer = message.senderType === "customer";
            const isInternal = !!message.isInternalNote;
            return (
              <div key={message.id} className={`flex ${isCustomer ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[85%]">
                  <div
                    className={[
                      "rounded-2xl px-3 py-2 text-sm shadow-sm",
                      isInternal
                        ? "border border-dashed bg-amber-50 text-amber-900"
                        : isCustomer
                          ? "bg-[#0072ce] text-white"
                          : "border border-slate-200 bg-white text-slate-900",
                    ].join(" ")}
                  >
                    {message.body}
                  </div>
                  <div
                    className={`mt-1 px-1 text-[11px] text-slate-400 ${isCustomer ? "text-right" : "text-left"}`}
                  >
                    {message.senderName || message.senderType} • {formatTime(message.createdAt)}
                  </div>
                </div>
              </div>
            );
          })}
          {isLoading && conversationPublicId ? (
            <div className="text-xs text-slate-400">Refreshing…</div>
          ) : null}
        </div>
        </div>

        <div className="shrink-0 border-t border-slate-200 p-4">
          <div className="flex gap-2">
            <textarea
              rows={3}
              className="min-h-[88px] flex-1 resize-none rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
              placeholder={conversationPublicId ? "Write a message…" : "First message to start…"}
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
            />
            {!conversationPublicId ? (
              <button
                type="button"
                disabled={!canStart || starting}
                onClick={() => void handleStart()}
                className="shrink-0 self-end rounded-2xl bg-[#0072ce] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0062b5] disabled:opacity-40"
              >
                {starting ? "…" : "Start"}
              </button>
            ) : (
              <button
                type="button"
                disabled={!messageInput.trim() || sending}
                onClick={() => void handleSend()}
                className="shrink-0 self-end rounded-2xl bg-[#0072ce] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0062b5] disabled:opacity-40"
              >
                {sending ? "…" : "Send"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
