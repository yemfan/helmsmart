"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SalesModel } from "@/lib/sales-models";

/**
 * AI Email Modal — single-shot AI-assisted email composition.
 *
 * Companion to AiSmsModal. Simpler scope on purpose:
 *   - One-shot. No conversation polling, no auto-reply loop. Email
 *     just isn't real-time the way SMS is — agents tend to draft +
 *     send + move on.
 *   - Subject + body fields are independently editable after the AI
 *     draft lands, so an agent can tighten the subject without
 *     regenerating the whole thing (or vice versa).
 *   - Successful send closes the modal with a confirmation toast.
 *     Inbound replies show up in the standard lead-detail
 *     conversation view that already exists.
 *
 * Uses sendOutboundEmail under the hood (via /api/sales-model/email/send),
 * which handles Resend delivery + email_messages + message_logs +
 * lead_event logging + last_contacted_at touch.
 */

type EmailContact = {
  id: string;
  name: string | null;
  email: string | null;
  property_address: string | null;
};

export function AiEmailModal({
  open,
  onClose,
  model,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  model: SalesModel;
  /** Optional success hook — fires after a successful send so the parent can show a toast or refresh adjacent data. */
  onSent?: () => void;
}) {
  const { t } = useTranslation("dashboard");
  // ── Picker state ────────────────────────────────────────────
  const [contactQuery, setContactQuery] = useState("");
  const [contactResults, setContactResults] = useState<EmailContact[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedContact, setSelectedContact] = useState<EmailContact | null>(null);

  // ── Compose state ───────────────────────────────────────────
  const [situation, setSituation] = useState("");
  const [subject, setSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // ── Reset on open/close ─────────────────────────────────────
  useEffect(() => {
    if (open) return;
    setContactQuery("");
    setContactResults([]);
    setSearching(false);
    setSelectedContact(null);
    setSituation("");
    setSubject("");
    setEmailBody("");
    setDrafting(false);
    setSending(false);
    setError(null);
    setSuccessMsg(null);
  }, [open]);

  // Esc-to-close.
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
        const url = new URL("/api/sales-model/email/contacts", window.location.origin);
        if (contactQuery.trim()) url.searchParams.set("q", contactQuery.trim());
        const res = await fetch(url.toString(), { credentials: "include" });
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          contacts?: EmailContact[];
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

  // ── Generate draft ──────────────────────────────────────────
  const onGenerateDraft = useCallback(async () => {
    if (!selectedContact) return;
    setDrafting(true);
    setError(null);
    try {
      const res = await fetch("/api/sales-model/email/draft", {
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
        subject?: string;
        body?: string;
        error?: string;
        code?: string;
      } | null;
      if (
        res.ok &&
        json?.ok &&
        typeof json.subject === "string" &&
        typeof json.body === "string"
      ) {
        setSubject(json.subject);
        setEmailBody(json.body);
        return;
      }
      setError(
        json?.error ??
          `Could not generate a draft (HTTP ${res.status}). You can still write one manually.`,
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? `Network error: ${e.message}`
          : "Could not reach the draft service.",
      );
    } finally {
      setDrafting(false);
    }
  }, [selectedContact, situation, model.id]);

  // ── Send ────────────────────────────────────────────────────
  const onSend = useCallback(async () => {
    if (!selectedContact) return;
    if (!subject.trim()) {
      setError("Subject is empty.");
      return;
    }
    if (!emailBody.trim()) {
      setError("Email body is empty.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/sales-model/email/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          contactId: selectedContact.id,
          subject: subject.trim(),
          body: emailBody.trim(),
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        delivered?: boolean;
        error?: string;
        code?: string;
      } | null;
      if (res.ok && json?.ok) {
        const delivered = json.delivered === true;
        setSuccessMsg(
          delivered
            ? "Email sent successfully."
            : "Email saved to your CRM. Delivery is queued — set RESEND_API_KEY to actually send.",
        );
        onSent?.();
        // Close after a brief pause so the agent sees the success
        // banner. Auto-clear avoids them having to click twice.
        window.setTimeout(() => {
          onClose();
        }, delivered ? 1400 : 2400);
        return;
      }
      const code = json?.code;
      const msg = json?.error ?? `Could not send (HTTP ${res.status}).`;
      setError(
        code === "resend_unconfigured"
          ? "Email sending isn't configured on this environment yet (Resend credentials missing). The draft was preserved."
          : code === "no_email"
            ? "This contact has no email address on file."
            : msg,
      );
    } catch (e) {
      setError(
        e instanceof Error ? `Network error: ${e.message}` : "Network error sending email.",
      );
    } finally {
      setSending(false);
    }
  }, [selectedContact, subject, emailBody, onSent, onClose]);

  const onChangeContact = () => {
    setSelectedContact(null);
    setSubject("");
    setEmailBody("");
    setSituation("");
    setError(null);
    setSuccessMsg(null);
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-email-title"
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !drafting && !sending) onClose();
      }}
    >
      <div className="flex h-full w-full max-w-3xl flex-col overflow-hidden bg-white shadow-2xl ring-1 ring-slate-900/10 sm:h-auto sm:max-h-[90vh] sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-purple-600">
              AI Email · {model.name}
            </p>
            <h2 id="ai-email-title" className="mt-0.5 text-lg font-semibold text-slate-900">
              {selectedContact?.name?.trim() ||
                selectedContact?.email ||
                "Compose an AI-assisted email"}
            </h2>
            {selectedContact ? (
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {selectedContact.email}
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-slate-500">{t("pages.aiComposeModal.emailIntro")}</p>
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
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {!selectedContact ? (
            // ── Picker phase ────────────────────────────────────
            <div className="flex flex-col gap-3 px-5 py-4">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">{t("pages.aiComposeModal.pickContact")}</label>
              <input
                type="search"
                value={contactQuery}
                onChange={(e) => setContactQuery(e.target.value)}
                placeholder={t("pages.aiComposeModal.searchEmail")}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                autoFocus
              />
              <div className="min-h-[200px] rounded-xl border border-slate-200 bg-slate-50">
                {searching && contactResults.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-slate-500">Searching…</p>
                ) : contactResults.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-slate-500">{t("pages.aiComposeModal.noEmailMatches")}</p>
                ) : (
                  <ul className="divide-y divide-slate-200">
                    {contactResults.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedContact(c);
                            setError(null);
                          }}
                          className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-white"
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple-100 text-sm font-semibold uppercase text-purple-700">
                            {(c.name || c.email || "?").trim().slice(0, 1)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-900">
                              {c.name?.trim() || c.email || "(unnamed contact)"}
                            </p>
                            <p className="truncate text-xs text-slate-500">
                              {c.email}
                              {c.property_address ? ` · ${c.property_address}` : ""}
                            </p>
                          </div>
                          <span className="text-xs font-medium text-purple-600">Pick →</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            // ── Compose phase ──────────────────────────────────
            <div className="space-y-4 px-5 py-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">{t("pages.aiComposeModal.emailGoal")}</label>
                <textarea
                  value={situation}
                  onChange={(e) => setSituation(e.target.value)}
                  rows={2}
                  placeholder={t("pages.aiComposeModal.goalPlaceholder")}
                  className="mt-1 block w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void onGenerateDraft()}
                  disabled={drafting || sending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-700 hover:border-purple-300 hover:bg-purple-100 disabled:opacity-60"
                >
                  <SparkIcon />
                  {drafting
                    ? "Drafting…"
                    : subject || emailBody
                      ? "Regenerate draft"
                      : "Generate draft with AI"}
                </button>
                <span className="text-xs text-slate-500">
                  Drafts use your{" "}
                  <span className="font-medium text-slate-700">{model.name}</span> tone.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">{t("pages.aiComposeModal.subject")}</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder={
                    drafting ? "Drafting…" : "Subject line (4-9 words is the sweet spot)"
                  }
                  className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">{t("pages.aiComposeModal.body")}</label>
                <textarea
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  rows={10}
                  placeholder={
                    drafting
                      ? "Drafting…"
                      : "Email body. Generate with AI above or write your own."
                  }
                  className="mt-1 block w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                />
              </div>

              {successMsg ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                  <strong className="font-semibold">{t("pages.aiComposeModal.sent")}</strong> {successMsg}
                </div>
              ) : null}
              {error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
                  {error}
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Footer */}
        {selectedContact ? (
          <div className="border-t border-slate-200 bg-slate-50/60 px-5 py-3">
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={drafting || sending}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
              >{t("pages.aiComposeModal.cancel")}</button>
              <button
                type="button"
                onClick={() => void onSend()}
                disabled={
                  sending || drafting || !subject.trim() || !emailBody.trim() || Boolean(successMsg)
                }
                className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {sending ? "Sending…" : successMsg ? "Sent ✓" : "Send Email"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
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
