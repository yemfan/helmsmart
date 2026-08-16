"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { describeSendFailure, type EquitySendCheckFailure } from "@/lib/spherePrediction/equitySendCheck";

type Channel = "sms" | "email";

type DraftResponse = {
  ok?: boolean;
  contactId?: string;
  score?: number;
  label?: "high" | "medium" | "low";
  draft?: {
    sms: string;
    emailSubject: string;
    emailBody: string;
    aiPowered: boolean;
  };
  error?: string;
};

type DraftState = {
  sms: string;
  emailSubject: string;
  emailBody: string;
  aiPowered: boolean;
};

type SendStatus =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; channel: Channel; at: string }
  | { kind: "blocked"; code: EquitySendCheckFailure["code"]; reason: string }
  | { kind: "error"; reason: string };

/**
 * SOI equity-update message review + send modal. Agent picks the channel
 * (SMS / email), edits if needed, and either copies to clipboard or sends
 * directly via the existing Twilio / Resend plumbing.
 *
 * Send path goes through /api/dashboard/sphere/likely-sellers/{id}/equity-message/send,
 * which gates on TCPA / DNC / lifecycle. Recoverable consent failures
 * surface here with channel-switch guidance ("This contact opted out of
 * SMS — try email").
 */
export default function EquityMessageDraftModal(props: {
  open: boolean;
  contactId: string | null;
  contactName: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation("dashboard");
  const [channel, setChannel] = useState<Channel>("sms");
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<Channel | null>(null);
  const [sendStatus, setSendStatus] = useState<SendStatus>({ kind: "idle" });

  useEffect(() => {
    if (!props.open || !props.contactId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setDraft(null);
    setCopied(null);
    setSendStatus({ kind: "idle" });

    (async () => {
      try {
        const res = await fetch(
          `/api/dashboard/sphere/likely-sellers/${encodeURIComponent(props.contactId!)}/equity-message`,
          { method: "POST", headers: { "Content-Type": "application/json" } },
        );
        const data = (await res.json().catch(() => ({}))) as DraftResponse;
        if (cancelled) return;
        if (!res.ok || data.ok === false || !data.draft) {
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        setDraft(data.draft);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to draft message");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [props.open, props.contactId]);

  function patch<K extends keyof DraftState>(key: K, value: DraftState[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
    // If the agent edits after a send-blocked / errored attempt, clear the
    // status so the UI doesn't claim "blocked" against the new content.
    if (sendStatus.kind !== "idle" && sendStatus.kind !== "sent") {
      setSendStatus({ kind: "idle" });
    }
  }

  async function sendCurrent() {
    if (!draft || !props.contactId) return;
    setSendStatus({ kind: "sending" });
    try {
      const payload =
        channel === "sms"
          ? { channel, body: draft.sms }
          : { channel, body: draft.emailBody, emailSubject: draft.emailSubject };

      const res = await fetch(
        `/api/dashboard/sphere/likely-sellers/${encodeURIComponent(props.contactId)}/equity-message/send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        sentAt?: string;
        code?: EquitySendCheckFailure["code"] | "contact_not_found" | "send_failed" | "channel_not_configured";
        error?: string;
      };
      if (res.ok && data.ok) {
        setSendStatus({ kind: "sent", channel, at: data.sentAt ?? new Date().toISOString() });
        return;
      }
      if (res.status === 409 && data.code) {
        // Recoverable — wrong lifecycle / opt-out / consent missing / etc.
        setSendStatus({
          kind: "blocked",
          code: data.code as EquitySendCheckFailure["code"],
          reason: data.error ?? "Send blocked.",
        });
        return;
      }
      setSendStatus({ kind: "error", reason: data.error ?? `HTTP ${res.status}` });
    } catch (e) {
      setSendStatus({
        kind: "error",
        reason: e instanceof Error ? e.message : "Send failed.",
      });
    }
  }

  async function copyCurrent() {
    if (!draft) return;
    const text =
      channel === "sms"
        ? draft.sms
        : `Subject: ${draft.emailSubject}\n\n${draft.emailBody}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(channel);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setError("Couldn't copy — your browser blocked clipboard access. Select + copy manually.");
    }
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <div className="flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
          <div className="min-w-0">
            <div className="text-base font-semibold text-slate-900">{t("pages.draftModal.equityTitle")}</div>
            <div className="mt-0.5 truncate text-xs text-slate-600">
              {props.contactName ?? "Contact"} · review and copy — not auto-sent
            </div>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
          >{t("pages.draftModal.close")}</button>
        </header>

        <div className="border-b border-slate-100 px-5 py-3">
          <div className="inline-flex rounded-full bg-slate-100 p-0.5">
            {(["sms", "email"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setChannel(c)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  channel === c ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {c === "sms" ? "SMS" : "Email"}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3 p-5">
          {loading ? (
            <div className="space-y-2">
              <div className="h-4 animate-pulse rounded bg-slate-100" />
              <div className="h-24 animate-pulse rounded bg-slate-100" />
              <p className="text-xs text-slate-500">Drafting your message…</p>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {error}
            </div>
          ) : draft ? (
            channel === "sms" ? (
              <>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{t("pages.draftModal.smsDraft")}</label>
                <textarea
                  value={draft.sms}
                  onChange={(e) => patch("sms", e.target.value)}
                  rows={5}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[11px] text-slate-500">
                  {draft.sms.length} / 320 chars
                </p>
              </>
            ) : (
              <>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{t("pages.draftModal.emailSubject")}</label>
                <input
                  value={draft.emailSubject}
                  onChange={(e) => patch("emailSubject", e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <label className="mt-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t("pages.draftModal.emailBody")}</label>
                <textarea
                  value={draft.emailBody}
                  onChange={(e) => patch("emailBody", e.target.value)}
                  rows={10}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </>
            )
          ) : null}
        </div>

        {draft ? (
          <footer className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/40 px-5 py-3">
            {sendStatus.kind === "blocked" ? (
              <SendBlockedBanner status={sendStatus} onSwitchChannel={() => setChannel(channel === "sms" ? "email" : "sms")} currentChannel={channel} />
            ) : sendStatus.kind === "sent" ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{t("pages.dashFragments.sentVia")} {sendStatus.channel === "sms" ? "SMS" : "email"} · message logged to the contact timeline.
              </div>
            ) : sendStatus.kind === "error" ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{t("pages.dashFragments.sendFailed")} {sendStatus.reason}. The draft is still here; you can retry or copy.
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] text-slate-500">
                {draft.aiPowered ? "Drafted by AI · review before sending" : "Template draft (no AI key) · personalize before sending"}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={copyCurrent}
                  disabled={sendStatus.kind === "sending" || sendStatus.kind === "sent"}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {copied === channel ? "Copied!" : "Copy"}
                </button>
                <button
                  type="button"
                  onClick={sendCurrent}
                  disabled={sendStatus.kind === "sending" || sendStatus.kind === "sent"}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {sendStatus.kind === "sending"
                    ? "Sending…"
                    : sendStatus.kind === "sent"
                      ? "Sent"
                      : channel === "sms"
                        ? "Send SMS"
                        : "Send email"}
                </button>
              </div>
            </div>
          </footer>
        ) : null}
      </div>
    </div>
  );
}

const CHANNEL_SWITCH_HINT_CODES: ReadonlySet<EquitySendCheckFailure["code"]> = new Set([
  "no_email",
  "no_phone",
  "email_opt_out",
  "sms_opt_out",
  "sms_consent_missing",
]);

function SendBlockedBanner(props: {
  status: { kind: "blocked"; code: EquitySendCheckFailure["code"]; reason: string };
  currentChannel: Channel;
  onSwitchChannel: () => void;
}) {
  const { t } = useTranslation("dashboard");
  const { code, reason } = props.status;
  const desc = describeSendFailure(code);
  // Switch CTA only makes sense when the failure is channel-specific AND the
  // other channel might work (e.g. SMS opt-out → try email).
  const otherChannel = props.currentChannel === "sms" ? "email" : "SMS";
  const showSwitch = CHANNEL_SWITCH_HINT_CODES.has(code);

  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <div className="min-w-0">
        <div className="font-semibold">{desc.title}</div>
        <div className="mt-0.5 leading-relaxed">{desc.hint}</div>
        {reason && reason !== desc.hint ? (
          <div className="mt-0.5 text-[11px] text-amber-700">{reason}</div>
        ) : null}
      </div>
      {showSwitch ? (
        <button
          type="button"
          onClick={props.onSwitchChannel}
          className="shrink-0 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100"
        >{t("pages.dashFragments.tryWord")} {otherChannel}
        </button>
      ) : null}
    </div>
  );
}
