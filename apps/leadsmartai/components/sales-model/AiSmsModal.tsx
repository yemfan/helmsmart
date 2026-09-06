"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";
import { AiActionGateBanner } from "@/components/entitlements/AiActionGateBanner";
import {
  detectAiActionGate,
  type AiActionGate,
} from "@/lib/entitlements/aiActionGate";
import type { SalesModel } from "@/lib/sales-models";

/**
 * AI SMS Modal — guided AI-assisted SMS conversation.
 *
 * Flow:
 *   1. Pick a contact from the search dropdown.
 *   2. Type a situation briefing ("what do you want this conversation
 *      to accomplish?").
 *   3. Click "Generate Draft" — server calls OpenAI with the
 *      sales-model tone + contact context to produce a first message.
 *   4. Edit the draft if needed, click "Send" — Twilio fires it off
 *      and a row lands in message_logs.
 *   5. Modal polls every 5s for new inbound messages. When the
 *      contact replies, the modal auto-runs the draft endpoint
 *      (which now sees prior history and produces a REPLY draft) and
 *      drops the result into the compose box for the agent to
 *      review/send.
 *
 * Polling vs realtime: we poll for MVP to keep the wire simple — no
 * client-side Supabase, no channel auth handshake. 5s feels live
 * enough for an SMS conversation and the user is staring at the modal
 * the whole time. Upgrade path is a single useEffect swap.
 */

type SmsContact = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  property_address: string | null;
};

type SmsMessage = {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  created_at: string;
};

const POLL_INTERVAL_MS = 5_000;

export function AiSmsModal({
  open,
  onClose,
  model,
}: {
  open: boolean;
  onClose: () => void;
  model: SalesModel;
}) {
  const { t } = useTranslation("dashboard");
  // ── Contact picker state ────────────────────────────────────
  const [contactQuery, setContactQuery] = useState("");
  const [contactResults, setContactResults] = useState<SmsContact[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedContact, setSelectedContact] = useState<SmsContact | null>(null);

  // ── Conversation state ──────────────────────────────────────
  const [situation, setSituation] = useState("");
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [compose, setCompose] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  // Sticky entitlement gate — once the server says the user can't run AI
  // actions (no plan, or monthly cap), disable "Generate" until they
  // close + reopen the modal, and surface a richer upgrade banner with a
  // direct path to /dashboard/billing instead of just a red error string.
  const [gate, setGate] = useState<AiActionGate | null>(null);

  // Track the last inbound message id we auto-drafted for, so we
  // don't repeatedly redraft for the same incoming message every
  // poll cycle.
  const lastAutoDraftedFor = useRef<string | null>(null);

  // Auto-scroll the conversation to the bottom on new messages.
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // ── Reset on open/close ─────────────────────────────────────
  useEffect(() => {
    if (open) return;
    // Modal closed — clear so re-opening is a clean slate.
    setContactQuery("");
    setContactResults([]);
    setSearching(false);
    setSelectedContact(null);
    setSituation("");
    setMessages([]);
    setCompose("");
    setDrafting(false);
    setSending(false);
    setError(null);
    setInfo(null);
    setGate(null);
    lastAutoDraftedFor.current = null;
  }, [open]);

  // Esc-to-close — common keyboard a11y expectation for modals.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !drafting && !sending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, drafting, sending, onClose]);

  // ── Contact search (debounced) ──────────────────────────────
  useEffect(() => {
    if (!open || selectedContact) return;
    const t = window.setTimeout(async () => {
      setSearching(true);
      try {
        const url = new URL("/api/sales-model/sms/contacts", window.location.origin);
        if (contactQuery.trim()) url.searchParams.set("q", contactQuery.trim());
        const res = await fetch(url.toString(), { credentials: "include" });
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          contacts?: SmsContact[];
        } | null;
        if (json?.ok && Array.isArray(json.contacts)) {
          setContactResults(json.contacts);
        } else {
          setContactResults([]);
        }
      } catch {
        setContactResults([]);
      } finally {
        setSearching(false);
      }
    }, 220);
    return () => window.clearTimeout(t);
  }, [contactQuery, open, selectedContact]);

  // ── Conversation load + poll ────────────────────────────────
  const refreshConversation = useCallback(
    async (contactId: string): Promise<SmsMessage[] | null> => {
      try {
        const res = await fetch(
          `/api/sales-model/sms/conversation?contactId=${encodeURIComponent(contactId)}`,
          { credentials: "include", cache: "no-store" },
        );
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          messages?: SmsMessage[];
          contact?: SmsContact;
        } | null;
        if (json?.ok && Array.isArray(json.messages)) {
          setMessages(json.messages);
          if (json.contact) setSelectedContact(json.contact);
          return json.messages;
        }
      } catch {
        // Silent — the next poll will retry.
      }
      return null;
    },
    [],
  );

  // Initial load on contact pick + poll loop while modal is open.
  useEffect(() => {
    if (!open || !selectedContact) return;
    void refreshConversation(selectedContact.id);
    const handle = window.setInterval(() => {
      void refreshConversation(selectedContact.id);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(handle);
  }, [open, selectedContact, refreshConversation]);

  // Auto-scroll on new messages.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // ── Safety read on the latest inbound message ───────────────
  // STOP-keywords (TCPA opt-out) hard-block both AI drafting and
  // hand-typed sending. Crisis/escalation language only blocks AI
  // drafting; the agent can still reply by hand. We compute these
  // client-side so the UI can surface a banner immediately, and
  // also rely on the server to enforce the same rules.
  const lastInbound = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].direction === "inbound") return messages[i];
    }
    return null;
  })();
  const optedOut = lastInbound ? isStopKeyword(lastInbound.body) : false;
  const needsHuman = lastInbound ? isEscalationLanguage(lastInbound.body) : false;

  // ── Auto-draft when a NEW inbound message arrives ───────────
  // The agent's mental model: "the lead replied; tell me what to
  // say next". This effect watches for an inbound message we
  // haven't auto-drafted for yet, runs the draft endpoint, and
  // drops the result into the compose box.
  useEffect(() => {
    if (!open || !selectedContact || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.direction !== "inbound") return;
    if (lastAutoDraftedFor.current === last.id) return;
    if (compose.trim()) return; // don't clobber an in-progress edit
    if (optedOut || needsHuman) {
      // Don't burn an AI call we know the server will reject. The
      // banner above the compose box explains why.
      lastAutoDraftedFor.current = last.id;
      return;
    }

    lastAutoDraftedFor.current = last.id;
    void runDraft({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, open, selectedContact, optedOut, needsHuman]);

  // ── Generate draft ──────────────────────────────────────────
  const runDraft = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!selectedContact) return;
      setDrafting(true);
      if (!opts?.silent) {
        setError(null);
        setInfo(null);
      }
      try {
        const res = await fetch("/api/sales-model/sms/draft", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            contactId: selectedContact.id,
            situation: situation.trim(),
            salesModel: model.id,
          }),
        });
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          draft?: string;
          error?: string;
          code?: string;
        } | null;
        if (res.ok && json?.ok && typeof json.draft === "string") {
          setCompose(json.draft.trim());
          if (opts?.silent) {
            setInfo("AI drafted a reply for you — review and send.");
          }
          return;
        }
        // Entitlement gate (HTTP 402) — switch the inline error to a
        // sticky upgrade banner AND fire the global upgrade modal so the
        // agent has a clear next step ("View plans") instead of just
        // being told they're blocked.
        const aiGate = detectAiActionGate(res.status, json);
        if (aiGate) {
          setGate(aiGate);
          if (!opts?.silent) setError(null);
          return;
        }
        if (!opts?.silent) {
          setError(
            json?.error ??
              `Could not generate a draft (HTTP ${res.status}). You can still write one manually.`,
          );
        }
      } catch (e) {
        if (!opts?.silent) {
          setError(
            e instanceof Error
              ? `Network error: ${e.message}`
              : "Could not reach the draft service.",
          );
        }
      } finally {
        setDrafting(false);
      }
    },
    [selectedContact, situation, model.id],
  );

  // ── Send ────────────────────────────────────────────────────
  const onSend = useCallback(async () => {
    if (!selectedContact) return;
    const body = compose.trim();
    if (!body) {
      setError("Compose a message before sending.");
      return;
    }
    setSending(true);
    setError(null);
    setInfo(null);

    // Optimistic — drop the message into the bubbles immediately
    // so the modal feels live. The real row will replace it on the
    // next poll; until then we tag it with a synthetic id.
    const optimistic: SmsMessage = {
      id: `optimistic-${Date.now()}`,
      direction: "outbound",
      body,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const res = await fetch("/api/sales-model/sms/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          contactId: selectedContact.id,
          message: body,
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        code?: string;
      } | null;

      if (!res.ok || !json?.ok) {
        // Roll back the optimistic bubble.
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        const code = json?.code;
        const msg = json?.error ?? `Could not send (HTTP ${res.status}).`;
        setError(
          code === "twilio_unconfigured"
            ? "SMS sending isn't configured on this environment yet (Twilio credentials missing). Your draft is preserved."
            : code === "no_phone"
              ? "This contact has no phone number on file."
              : msg,
        );
        return;
      }

      // Success — clear compose, refresh from server so the real
      // row replaces the optimistic one.
      setCompose("");
      void refreshConversation(selectedContact.id);
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setError(
        e instanceof Error ? `Network error: ${e.message}` : "Network error sending SMS.",
      );
    } finally {
      setSending(false);
    }
  }, [selectedContact, compose, refreshConversation]);

  // ── Picker → conversation transition ────────────────────────
  const onPickContact = (c: SmsContact) => {
    setSelectedContact(c);
    setError(null);
    setInfo(null);
    // Pre-load the conversation so we know if it's an opener or a
    // reply before the agent generates a draft.
    void refreshConversation(c.id);
  };

  const onChangeContact = () => {
    setSelectedContact(null);
    setMessages([]);
    setCompose("");
    setSituation("");
    setError(null);
    setInfo(null);
    lastAutoDraftedFor.current = null;
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-sms-title"
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !drafting && !sending) onClose();
      }}
    >
      <div className="flex h-full w-full max-w-3xl flex-col overflow-hidden bg-white shadow-2xl ring-1 ring-slate-900/10 sm:h-[88vh] sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">
              {t("pages.aiSmsModal.eyebrow", { model: model.name })}
            </p>
            <h2 id="ai-sms-title" className="mt-0.5 text-lg font-semibold text-slate-900">
              {selectedContact?.name?.trim() || selectedContact?.phone || t("pages.aiSms.launchAnAiSms")}
            </h2>
            {selectedContact ? (
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {selectedContact.phone}
                {selectedContact.email ? ` · ${selectedContact.email}` : ""}
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-slate-500">{t("pages.aiComposeModal.smsIntro")}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {selectedContact ? (
              <button
                type="button"
                onClick={onChangeContact}
                disabled={drafting || sending}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
              >{t("pages.aiComposeModal.change")}</button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              disabled={drafting || sending}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
              aria-label={t("pages.aiComposeModal.close")}
            >{t("pages.aiComposeModal.close")}</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col">
          {!selectedContact ? (
            // ── Picker phase ────────────────────────────────────
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">{t("pages.aiComposeModal.pickContact")}</label>
              <input
                type="search"
                value={contactQuery}
                onChange={(e) => setContactQuery(e.target.value)}
                placeholder={t("pages.aiComposeModal.searchPhone")}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                autoFocus
              />
              <div className="min-h-[200px] rounded-xl border border-slate-200 bg-slate-50">
                {searching && contactResults.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-slate-500">{t("pages.aiModal.searching")}</p>
                ) : contactResults.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-slate-500">{t("pages.aiComposeModal.noPhoneMatches")}</p>
                ) : (
                  <ul className="divide-y divide-slate-200">
                    {contactResults.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => onPickContact(c)}
                          className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-white"
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold uppercase text-blue-700">
                            {(c.name || c.phone || "?").trim().slice(0, 1)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-900">
                              {c.name?.trim() || c.phone || "(unnamed contact)"}
                            </p>
                            <p className="truncate text-xs text-slate-500">
                              {c.phone}
                              {c.property_address ? ` · ${c.property_address}` : ""}
                            </p>
                          </div>
                          <span className="text-xs font-medium text-blue-600">{t("pages.aiModal.pick")}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            // ── Conversation phase ─────────────────────────────
            <>
              {/* Situation block — collapses to a one-line summary
                  once the conversation has started so the bubbles get
                  more vertical space. */}
              {messages.length === 0 ? (
                <div className="border-b border-slate-200 px-5 py-3">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">{t("pages.aiComposeModal.smsGoal")}</label>
                  <textarea
                    value={situation}
                    onChange={(e) => setSituation(e.target.value)}
                    rows={2}
                    placeholder={t("pages.aiComposeModal.goalPlaceholder")}
                    className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              ) : situation.trim() ? (
                <div className="flex items-baseline gap-2 border-b border-slate-100 bg-slate-50/60 px-5 py-2">
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t("pages.aiComposeModal.goal")}</span>
                  <p className="truncate text-xs text-slate-600" title={situation}>
                    {situation}
                  </p>
                </div>
              ) : null}

              {/* Conversation bubbles */}
              <div
                ref={scrollerRef}
                className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto bg-slate-50 px-4 py-4"
              >
                {messages.length === 0 ? (
                  <div className="m-auto max-w-sm rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center">
                    <p className="text-sm font-medium text-slate-700">{t("pages.aiComposeModal.noMessages")}</p>
                    <p className="mt-1 text-xs text-slate-500">{t("pages.dashFragments.generateFirstDraft")}{" "}
                      <span className="font-medium text-slate-700">{model.name}</span> tone.
                    </p>
                  </div>
                ) : (
                  messages.map((m) => <Bubble key={m.id} m={m} />)
                )}
                {drafting ? (
                  <div className="self-end rounded-2xl bg-blue-100 px-3 py-1.5 text-[11px] italic text-blue-700">
                    {t("pages.aiModal.drafting")}
                  </div>
                ) : null}
              </div>

              {/* Compose */}
              <div className="border-t border-slate-200 bg-white px-4 py-3">
                {optedOut ? (
                  <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
                    <strong className="font-semibold">{t("pages.aiComposeModal.optedOut")}</strong>{" "}{t("pages.dashFragments.stopKeyword")}</div>
                ) : needsHuman ? (
                  <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <strong className="font-semibold">{t("pages.aiComposeModal.needsYou")}</strong>{" "}{t("pages.dashFragments.looksLikeComplaint")}</div>
                ) : gate ? (
                  <AiActionGateBanner reason={gate.reason} className="mb-2" />
                ) : null}
                {info ? (
                  <p className="mb-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-800">
                    {info}
                  </p>
                ) : null}
                {error ? (
                  <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-800">
                    {error}
                  </p>
                ) : null}
                <textarea
                  value={compose}
                  onChange={(e) => {
                    setCompose(e.target.value);
                    if (info) setInfo(null);
                  }}
                  rows={3}
                  placeholder={
                    messages.length === 0
                      ? "Click 'Generate Draft' to have AI write the first message — or type your own."
                      : "Compose your reply, or click 'Generate Draft' to have AI write one."
                  }
                  className="block w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void runDraft()}
                      disabled={drafting || sending || optedOut || needsHuman || gate != null}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:border-blue-300 hover:bg-blue-100 disabled:opacity-60"
                      title={
                        optedOut
                          ? t("pages.aiSms.draftBlockedOptedOut")
                          : needsHuman
                            ? t("pages.aiSms.draftBlockedNeedsHuman")
                            : gate
                              ? gate.reason === "no_agent_entitlement"
                                ? t("pages.aiSms.draftBlockedNoEntitlement")
                                : t("pages.aiSms.draftBlockedAiCap")
                              : undefined
                      }
                    >
                      <SparkIcon />
                      {drafting
                        ? t("common:status.drafting")
                        : compose.trim()
                          ? t("pages.aiEmail.regenerateDraft")
                          : messages.length === 0
                            ? t("pages.aiSms.generateFirstDraft")
                            : t("pages.aiSms.generateReply")}
                    </button>
                    <CharCounter value={compose} />
                  </div>
                  <button
                    type="button"
                    onClick={() => void onSend()}
                    disabled={sending || drafting || !compose.trim() || optedOut}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                    title={optedOut ? t("pages.aiSms.sendBlockedOptedOut") : undefined}
                  >
                    {sending ? t("common:status.sending") : t("pages.outboundSmsComposer.sendSms")}
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

function Bubble({ m }: { m: SmsMessage }) {
  const { i18n } = useTranslation("dashboard");
  const inbound = m.direction === "inbound";
  return (
    <div className={inbound ? "flex justify-start" : "flex justify-end"}>
      <div
        className={[
          "max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm",
          inbound
            ? "rounded-bl-md bg-white text-slate-800 ring-1 ring-slate-200"
            : "rounded-br-md bg-blue-600 text-white",
        ].join(" ")}
      >
        <p className="whitespace-pre-wrap break-words">{m.body}</p>
        <p
          className={[
            "mt-0.5 text-[10px] tabular-nums",
            inbound ? "text-slate-400" : "text-blue-100",
          ].join(" ")}
        >
          {formatTime(m.created_at, intlLocale(i18n.language))}
          {!inbound && m.id.startsWith("optimistic-") ? " · sending…" : ""}
        </p>
      </div>
    </div>
  );
}

function CharCounter({ value }: { value: string }) {
  // Its own hook: a sub-component inherits no translator from its parent.
  const { t } = useTranslation("dashboard");
  const len = value.length;
  // Twilio segments at 160 chars (GSM-7) — once we cross that, the
  // SMS turns into multiple messages and the agent should know.
  const segments = Math.max(1, Math.ceil(len / 160));
  const tone = segments > 2 ? "text-amber-600" : segments > 1 ? "text-slate-600" : "text-slate-400";
  return (
    <span className={`text-[11px] tabular-nums ${tone}`}>
      {t("pages.aiSmsModal.charsSegments", { count: segments, chars: len })}
    </span>
  );
}

function formatTime(iso: string, locale: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
}

// ── Safety helpers (mirror server-side ai-sms/safety.ts) ─────────
//
// We duplicate the regexes here so the UI can show the warning
// banner the moment a STOP / escalation reply lands, without a
// round-trip. Server still enforces — these are advisory at the
// client. Keep them in sync with apps/leadsmartai/lib/ai-sms/safety.ts.

function isStopKeyword(body: string): boolean {
  return /^(stop|unsubscribe|end|quit|cancel)$/i.test(body.trim());
}

function isEscalationLanguage(body: string): boolean {
  const t = body.toLowerCase();
  return /(lawsuit|attorney|complaint|fraud|scam|angry|terrible|file against|urgent now)/.test(t);
}

function SparkIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    </svg>
  );
}
