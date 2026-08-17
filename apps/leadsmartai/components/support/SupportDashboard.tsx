"use client";

import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchConversation,
  fetchConversationList,
  markConversationRead,
  sendSupportMessage,
  updateConversationMeta,
  type SupportConversationDetail,
  type SupportConversationSummary,
  type SupportPriority,
  type SupportStatus,
} from "@/lib/support-chat/api";
import { usePolling } from "@/lib/support-chat/polling";
import {
  SupportRealtimePresencePill,
  SupportRealtimeTypingRow,
  useSupportRealtime,
} from "@/lib/support-chat/useSupportRealtime";

function formatTime(iso: string | undefined, locale: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusClasses(status: SupportStatus) {
  switch (status) {
    case "open":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "waiting_on_support":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "waiting_on_customer":
      return "bg-purple-50 text-purple-700 border-purple-200";
    case "resolved":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "closed":
      return "bg-gray-100 text-gray-700 border-gray-200";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

function priorityClasses(priority: SupportPriority) {
  switch (priority) {
    case "urgent":
      return "bg-red-50 text-red-700 border-red-200";
    case "high":
      return "bg-orange-50 text-orange-700 border-orange-200";
    case "normal":
      return "bg-gray-100 text-gray-700 border-gray-200";
    case "low":
      return "bg-slate-50 text-slate-600 border-slate-200";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

/**
 * Support inbox using `/api/support-chat/*` + polling.
 * Ensure those routes are protected in production (e.g. middleware / auth); list/update/message
 * were opened for dev — do not expose this page publicly without locking the API down.
 */
export default function SupportDashboard() {
  const { t, i18n } = useTranslation("dashboard");
  // Dates followed the browser default, not the language the agent picked.
  const dateLocale = intlLocale(i18n.language);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedPublicId, setSelectedPublicId] = useState("");
  const [reply, setReply] = useState("");
  const [updating, setUpdating] = useState(false);
  const [sending, setSending] = useState(false);

  const fetchList = useCallback(
    () => fetchConversationList({ status: statusFilter }),
    [statusFilter]
  );

  const fetchThread = useCallback(
    () => fetchConversation(selectedPublicId),
    [selectedPublicId]
  );

  const {
    data: listData,
    isLoading: listLoading,
    error: listError,
    reload: reloadList,
  } = usePolling<{ success: true; conversations: SupportConversationSummary[] }>({
    enabled: true,
    intervalMs: 15000,
    fetcher: fetchList,
  });

  const {
    data: threadData,
    isLoading: threadLoading,
    error: threadError,
    reload: reloadThread,
  } = usePolling<{ success: true; conversation: SupportConversationDetail | null }>({
    enabled: Boolean(selectedPublicId),
    intervalMs: 5000,
    fetcher: fetchThread,
  });

  const conversations = listData?.conversations ?? [];
  const selectedConversation = threadData?.conversation ?? null;

  const {
    typingLabel,
    peerPresenceLabel,
    notifyComposerActivity,
    flushTypingStop,
  } = useSupportRealtime({
    conversationPublicId: selectedPublicId,
    role: "support",
    displayName: "Support Agent",
    enabled: Boolean(selectedPublicId),
  });

  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      const q = search.toLowerCase();
      const matchesSearch =
        c.customerName.toLowerCase().includes(q) ||
        c.customerEmail.toLowerCase().includes(q) ||
        (c.subject ?? "").toLowerCase().includes(q);

      return matchesSearch;
    });
  }, [conversations, search]);

  useEffect(() => {
    if (!selectedPublicId && filteredConversations.length > 0) {
      setSelectedPublicId(filteredConversations[0].publicId);
    }
  }, [filteredConversations, selectedPublicId]);

  useEffect(() => {
    if (!selectedPublicId) return;
    void markConversationRead({
      conversationPublicId: selectedPublicId,
      readerType: "support",
    });
  }, [selectedPublicId, selectedConversation?.messages?.length]);

  useEffect(() => {
    if (
      selectedPublicId &&
      threadData &&
      threadData.success &&
      threadData.conversation === null
    ) {
      setSelectedPublicId("");
    }
  }, [selectedPublicId, threadData]);

  async function handleSendReply() {
    if (!selectedPublicId || !reply.trim() || sending) return;

    try {
      setSending(true);
      flushTypingStop();

      await sendSupportMessage({
        conversationPublicId: selectedPublicId,
        senderType: "support",
        senderName: "Support Agent",
        body: reply.trim(),
      });

      setReply("");
      await reloadThread();
      await reloadList();
    } finally {
      setSending(false);
    }
  }

  async function handleUpdateStatus(status: SupportStatus) {
    if (!selectedPublicId || updating) return;

    try {
      setUpdating(true);
      await updateConversationMeta({
        conversationPublicId: selectedPublicId,
        status,
      });
      await reloadThread();
      await reloadList();
    } finally {
      setUpdating(false);
    }
  }

  async function handleUpdatePriority(priority: SupportPriority) {
    if (!selectedPublicId || updating) return;

    try {
      setUpdating(true);
      await updateConversationMeta({
        conversationPublicId: selectedPublicId,
        priority,
      });
      await reloadThread();
      await reloadList();
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-gray-900">{t("support.title")}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {t("support.subtitle")}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 md:flex">
            <div className="rounded-2xl border bg-white px-4 py-3 text-sm shadow-sm">
              <div className="text-gray-400">{t("support.openCount")}</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">
                {conversations.filter((c) => c.status === "open").length}
              </div>
            </div>
            <div className="rounded-2xl border bg-white px-4 py-3 text-sm shadow-sm">
              <div className="text-gray-400">{t("support.waitingCount")}</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">
                {conversations.filter((c) => c.status === "waiting_on_support").length}
              </div>
            </div>
          </div>
        </div>

        {(listError || threadError) && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {listError || threadError}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="rounded-3xl border bg-white shadow-sm">
            <div className="border-b p-4">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("support.searchPlaceholder")}
                className="w-full rounded-2xl border px-4 py-2.5 text-sm outline-none focus:border-gray-400"
              />
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {[
                  { label: t("support.filters.all"), value: "all" },
                  { label: t("support.filters.open"), value: "open" },
                  { label: t("support.filters.waiting"), value: "waiting_on_support" },
                  { label: t("support.filters.resolved"), value: "resolved" },
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setStatusFilter(item.value)}
                    className={[
                      "rounded-full border px-3 py-1.5 text-xs whitespace-nowrap",
                      statusFilter === item.value
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
                    ].join(" ")}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="max-h-[720px] overflow-y-auto p-3">
              {listLoading ? (
                <div className="p-4 text-sm text-gray-500">{t("support.loadingList")}</div>
              ) : (
                <div className="space-y-2">
                  {filteredConversations.map((conversation) => {
                    const selected = selectedPublicId === conversation.publicId;

                    return (
                      <button
                        key={conversation.id}
                        type="button"
                        onClick={() => setSelectedPublicId(conversation.publicId)}
                        className={[
                          "w-full rounded-2xl border p-4 text-left transition",
                          selected ? "border-gray-900 bg-gray-900 text-white" : "bg-white hover:bg-gray-50",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">{conversation.customerName}</div>
                            <div
                              className={`truncate text-xs ${selected ? "text-gray-300" : "text-gray-500"}`}
                            >
                              {conversation.customerEmail}
                            </div>
                          </div>

                          {conversation.unreadForSupport > 0 && (
                            <span
                              className={[
                                "rounded-full px-2 py-0.5 text-xs font-medium",
                                selected ? "bg-white/15 text-white" : "bg-red-50 text-red-700",
                              ].join(" ")}
                            >
                              {conversation.unreadForSupport}
                            </span>
                          )}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <span
                            className={[
                              "rounded-full border px-2 py-1 text-[11px]",
                              selected ? "border-white/15 text-white" : statusClasses(conversation.status),
                            ].join(" ")}
                          >
                            {conversation.status.replaceAll("_", " ")}
                          </span>

                          <span
                            className={[
                              "rounded-full border px-2 py-1 text-[11px]",
                              selected ? "border-white/15 text-white" : priorityClasses(conversation.priority),
                            ].join(" ")}
                          >
                            {conversation.priority}
                          </span>
                        </div>

                        <div className={`mt-3 text-xs ${selected ? "text-gray-300" : "text-gray-500"}`}>
                          {conversation.subject || "No subject"}
                        </div>
                        <div className={`mt-1 text-xs ${selected ? "text-gray-400" : "text-gray-400"}`}>
                          {formatTime(conversation.lastMessageAt, dateLocale)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>

          <section className="rounded-3xl border bg-white shadow-sm">
            {selectedConversation ? (
              <div className="flex h-full flex-col">
                <div className="border-b p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">
                        {selectedConversation.customerName}
                      </h2>
                      <div className="mt-1 text-sm text-gray-500">{selectedConversation.customerEmail}</div>
                      <div className="mt-2 text-sm text-gray-700">
                        {selectedConversation.subject || "No subject"}
                      </div>
                      <SupportRealtimePresencePill text={peerPresenceLabel} />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <select
                        value={selectedConversation.status}
                        disabled={updating}
                        onChange={(e) => void handleUpdateStatus(e.target.value as SupportStatus)}
                        className="rounded-xl border px-3 py-2 text-sm"
                      >
                        <option value="open">{t("support.status.open")}</option>
                        <option value="waiting_on_support">{t("support.status.waiting_on_support")}</option>
                        <option value="waiting_on_customer">{t("support.status.waiting_on_customer")}</option>
                        <option value="resolved">{t("support.status.resolved")}</option>
                        <option value="closed">{t("support.status.closed")}</option>
                      </select>

                      <select
                        value={selectedConversation.priority}
                        disabled={updating}
                        onChange={(e) => void handleUpdatePriority(e.target.value as SupportPriority)}
                        className="rounded-xl border px-3 py-2 text-sm"
                      >
                        <option value="low">{t("support.priority.low")}</option>
                        <option value="normal">{t("support.priority.normal")}</option>
                        <option value="high">{t("support.priority.high")}</option>
                        <option value="urgent">{t("support.priority.urgent")}</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="grid flex-1 gap-0 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="flex min-h-[680px] flex-col border-r">
                    <div className="flex-1 overflow-y-auto p-5">
                      {threadLoading ? (
                        <div className="text-sm text-gray-500">{t("support.loadingConversation")}</div>
                      ) : (
                        <div className="space-y-4">
                          {selectedConversation.messages.map((message) => {
                            const isCustomer = message.senderType === "customer";

                            return (
                              <div
                                key={message.id}
                                className={`flex ${isCustomer ? "justify-start" : "justify-end"}`}
                              >
                                <div className="max-w-[82%]">
                                  <div className="mb-1 text-xs text-gray-400">
                                    {message.senderName || message.senderType} •{" "}
                                    {formatTime(message.createdAt, dateLocale)}
                                  </div>
                                  <div
                                    className={[
                                      "rounded-2xl px-4 py-3 text-sm shadow-sm",
                                      message.isInternalNote
                                        ? "border border-dashed bg-yellow-50 text-yellow-900"
                                        : isCustomer
                                          ? "border bg-white text-gray-900"
                                          : "bg-gray-900 text-white",
                                    ].join(" ")}
                                  >
                                    {message.body}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="border-t p-4">
                      <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-400">{t("pages.supportDashboard.replyToCustomer")}</label>
                      <SupportRealtimeTypingRow text={typingLabel} />
                      <div className="flex gap-3">
                        <textarea
                          value={reply}
                          onChange={(e) => {
                            const v = e.target.value;
                            setReply(v);
                            notifyComposerActivity(v.length > 0);
                          }}
                          onBlur={() => notifyComposerActivity(false)}
                          rows={4}
                          placeholder={t("support.replyPlaceholder")}
                          className="flex-1 resize-none rounded-2xl border px-4 py-3 text-sm outline-none focus:border-gray-400"
                        />
                        <button
                          type="button"
                          onClick={() => void handleSendReply()}
                          disabled={!reply.trim() || sending}
                          className="self-end rounded-2xl bg-gray-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
                        >
                          {sending ? t("support.sending") : t("support.sendReply")}
                        </button>
                      </div>
                    </div>
                  </div>

                  <aside className="p-5">
                    <div className="rounded-2xl bg-gray-50 p-4">
                      <h3 className="text-sm font-semibold text-gray-900">{t("support.details")}</h3>
                      <dl className="mt-4 space-y-3 text-sm">
                        <div>
                          <dt className="text-gray-400">{t("support.assigned")}</dt>
                          <dd className="mt-1 text-gray-900">
                            {selectedConversation.assignedAgentName || t("support.unassigned")}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-gray-400">{t("support.unreadForCustomer")}</dt>
                          <dd className="mt-1 text-gray-900">{selectedConversation.unreadForCustomer}</dd>
                        </div>
                        <div>
                          <dt className="text-gray-400">{t("support.lastUpdated")}</dt>
                          <dd className="mt-1 text-gray-900">
                            {formatTime(selectedConversation.lastMessageAt, dateLocale)}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    <div className="mt-5 rounded-2xl border p-4">
                      <h3 className="text-sm font-semibold text-gray-900">{t("support.quickActions")}</h3>
                      <div className="mt-3 grid gap-2">
                        <button
                          type="button"
                          onClick={() => void handleUpdateStatus("resolved")}
                          disabled={updating}
                          className="rounded-xl bg-gray-900 px-4 py-3 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                        >
                          {t("support.markResolved")}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleUpdatePriority("urgent")}
                          disabled={updating}
                          className="rounded-xl border px-4 py-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-50"
                        >
                          {t("support.markUrgent")}
                        </button>
                      </div>
                    </div>
                  </aside>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[680px] items-center justify-center text-gray-500">
                {t("support.selectPrompt")}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
