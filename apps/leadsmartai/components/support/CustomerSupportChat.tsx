"use client";

import { Headset } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  fetchConversation,
  markConversationRead,
  sendSupportMessage,
  startSupportConversation,
  type SupportConversationDetail,
} from "@/lib/support-chat/api";
import { usePolling } from "@/lib/support-chat/polling";
import {
  SupportRealtimePresencePill,
  SupportRealtimeTypingRow,
  useSupportRealtime,
} from "@/lib/support-chat/useSupportRealtime";

function formatTime(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export type CustomerSupportChatProps = {
  /** Slide-over panel (navbar widget): full height, close button */
  embedded?: boolean;
  onClose?: () => void;
};

export default function CustomerSupportChat({
  embedded = false,
  onClose,
}: CustomerSupportChatProps) {
  const { t } = useTranslation("dashboard");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [conversationPublicId, setConversationPublicId] = useState("");
  const [starting, setStarting] = useState(false);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const canStart = useMemo(() => {
    return (
      customerName.trim().length >= 2 &&
      /.+@.+\..+/.test(customerEmail.trim()) &&
      messageInput.trim().length > 0
    );
  }, [customerName, customerEmail, messageInput]);

  const { data, isLoading, error, reload } = usePolling<{
    success: true;
    conversation: SupportConversationDetail | null;
  }>({
    enabled: Boolean(conversationPublicId),
    intervalMs: 5000,
    fetcher: () => fetchConversation(conversationPublicId),
  });

  const conversation = data?.conversation ?? null;

  const {
    typingLabel,
    peerPresenceLabel,
    notifyComposerActivity,
    flushTypingStop,
  } = useSupportRealtime({
    conversationPublicId,
    role: "customer",
    displayName: customerName.trim() || "Customer",
    enabled: Boolean(conversationPublicId),
  });

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [conversation?.messages?.length, isLoading]);

  useEffect(() => {
    if (!conversationPublicId) return;
    void markConversationRead({
      conversationPublicId,
      readerType: "customer",
    });
  }, [conversationPublicId, conversation?.messages?.length]);

  async function handleStartChat() {
    if (!canStart || starting) return;

    try {
      setStarting(true);

      const result = await startSupportConversation({
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim().toLowerCase(),
        subject: subject.trim() || undefined,
        initialMessage: messageInput.trim(),
        source: "website_chat",
      });

      setConversationPublicId(result.conversation.publicId);
      setMessageInput("");
    } catch (err) {
      console.error(err);
    } finally {
      setStarting(false);
    }
  }

  async function handleSendMessage() {
    if (!conversationPublicId || !messageInput.trim() || sending) return;

    try {
      setSending(true);
      flushTypingStop();

      const body = messageInput.trim();
      setMessageInput("");

      await sendSupportMessage({
        conversationPublicId,
        senderType: "customer",
        senderName: customerName.trim() || undefined,
        senderEmail: customerEmail.trim().toLowerCase() || undefined,
        body,
      });

      reload();
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  }

  const outerClass = embedded
    ? "flex h-full min-h-0 w-full flex-col bg-white"
    : "mx-auto max-w-4xl rounded-3xl border bg-white shadow-sm";

  const listClass = embedded
    ? "min-h-0 flex-1 space-y-4 overflow-y-auto p-5"
    : "min-h-[420px] max-h-[520px] space-y-4 overflow-y-auto p-5";

  return (
    <div className={outerClass}>
      {embedded ? (
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
          <span id="ls-support-chat-title" className="text-sm font-semibold text-gray-900">{t("pages.supportChat.support")}</span>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
              aria-label={t("pages.supportChat.closeChat")}
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ) : null}
        </div>
      ) : null}

      <div className={embedded ? "flex min-h-0 flex-1 flex-col" : undefined}>
        <div className="border-b p-5">
          <h2 className="text-xl font-semibold text-gray-900">{t("pages.supportChat.title")}</h2>
          <p className="mt-1 text-sm text-gray-500">
            {conversationPublicId
              ? "This conversation refreshes automatically."
              : "Start a conversation and our support team will reply here."}
          </p>
          {conversationPublicId ? <SupportRealtimePresencePill text={peerPresenceLabel} /> : null}
        </div>

        {!conversationPublicId && (
          <div className="grid gap-4 border-b p-5 md:grid-cols-2">
            <input
              className="rounded-2xl border px-4 py-3 text-sm outline-none focus:border-gray-400"
              placeholder={t("pages.supportChat.yourName")}
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
            <input
              className="rounded-2xl border px-4 py-3 text-sm outline-none focus:border-gray-400"
              placeholder={t("pages.supportChat.yourEmail")}
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
            />
            <input
              className="rounded-2xl border px-4 py-3 text-sm outline-none focus:border-gray-400 md:col-span-2"
              placeholder={t("pages.supportChat.subject")}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
        )}

        <div ref={listRef} className={listClass}>
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {!conversationPublicId && (
            <div className="rounded-2xl border bg-gray-50 p-4 text-sm text-gray-600">{t("pages.supportChat.describeIssue")}</div>
          )}

          {conversation?.messages?.map((message) => {
            const isCustomer = message.senderType === "customer";
            const isInternal = !!message.isInternalNote;

            return (
              <div
                key={message.id}
                className={`flex ${isCustomer ? "justify-end" : "justify-start"}`}
              >
                <div className="max-w-[82%]">
                  <div
                    className={[
                      "rounded-2xl px-4 py-3 text-sm shadow-sm",
                      isInternal
                        ? "border border-dashed bg-yellow-50 text-yellow-900"
                        : isCustomer
                          ? "bg-gray-900 text-white"
                          : "border bg-white text-gray-900",
                    ].join(" ")}
                  >
                    {message.body}
                  </div>
                  <div
                    className={`mt-1 px-1 text-xs text-gray-400 ${
                      isCustomer ? "text-right" : "text-left"
                    }`}
                  >
                    {message.senderName || message.senderType} • {formatTime(message.createdAt)}
                  </div>
                </div>
              </div>
            );
          })}

          {isLoading && conversationPublicId && (
            <div className="text-sm text-gray-400">Refreshing…</div>
          )}
        </div>

        <div className="border-t p-5">
          <SupportRealtimeTypingRow text={typingLabel} />
          <div className="flex gap-3">
            <textarea
              rows={3}
              className="flex-1 resize-none rounded-2xl border px-4 py-3 text-sm outline-none focus:border-gray-400"
              placeholder={
                conversationPublicId
                  ? "Write your message..."
                  : "Describe your issue to start the chat..."
              }
              value={messageInput}
              onChange={(e) => {
                const v = e.target.value;
                setMessageInput(v);
                if (conversationPublicId) {
                  notifyComposerActivity(v.length > 0);
                }
              }}
              onBlur={() => {
                if (conversationPublicId) notifyComposerActivity(false);
              }}
            />

            {!conversationPublicId ? (
              <button
                type="button"
                onClick={() => void handleStartChat()}
                disabled={!canStart || starting}
                className="self-end rounded-2xl bg-gray-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {starting ? "Starting..." : "Start chat"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleSendMessage()}
                disabled={!messageInput.trim() || sending}
                className="self-end rounded-2xl bg-gray-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {sending ? "Sending..." : "Send"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export type SupportChatLauncherProps = {
  /** Extra classes for the icon button (e.g. marketing vs dashboard) */
  buttonClassName?: string;
};

/** Navbar / shell chat icon: opens a slide-over with {@link CustomerSupportChat}. */
export function SupportChatLauncher({ buttonClassName }: SupportChatLauncherProps) {
  const { t } = useTranslation("dashboard");
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") setOpen(false);
      };
      window.addEventListener("keydown", onKey);
      return () => {
        document.body.style.overflow = prev;
        window.removeEventListener("keydown", onKey);
      };
    }
    // Keep mounted briefly for exit animation
    const t = setTimeout(() => setMounted(false), 300);
    return () => clearTimeout(t);
  }, [open]);

  const btn =
    buttonClassName ??
    "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200/90 bg-white text-slate-600 shadow-sm ring-1 ring-slate-900/[0.03] transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40";

  // The overlay is rendered into document.body via a portal. The launcher
  // lives inside the sticky/transformed Topbar, and a `position: fixed`
  // descendant of a transformed ancestor is positioned relative to that
  // ancestor — which collapsed the `inset-y-0` panel to the ~81px header
  // height and let the page bleed through below it. Portaling to <body>
  // makes `fixed` resolve against the viewport, so the panel is full height.
  const overlay =
    mounted && typeof document !== "undefined"
      ? createPortal(
          <>
            <button
              type="button"
              className="fixed inset-0 z-[80] transition-opacity duration-200"
              style={{
                backgroundColor: open ? "rgba(15,23,42,0.4)" : "transparent",
                backdropFilter: open ? "blur(4px)" : "none",
              }}
              aria-label={t("pages.supportChat.closeChat")}
              onClick={() => setOpen(false)}
            />
            <div
              className="fixed inset-y-0 right-0 z-[90] flex w-full max-w-lg flex-col bg-white shadow-2xl ring-1 ring-slate-900/10 transition-transform duration-200 ease-out"
              style={{ transform: open ? "translateX(0)" : "translateX(100%)" }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="ls-support-chat-title"
            >
              <CustomerSupportChat embedded onClose={() => setOpen(false)} />
            </div>
          </>,
          document.body,
        )
      : null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={btn} aria-label={t("pages.supportChat.openChat")}>
        <Headset className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
      </button>
      {overlay}
    </>
  );
}
