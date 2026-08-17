"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

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

/**
 * Review-only AI buyer-outreach draft modal. Mirrors the seller-side
 * EquityMessageDraftModal — same SMS/email tabs, same Copy interaction —
 * but routes to the buyer outreach endpoint and uses buyer-angle copy.
 *
 * Send wiring is intentionally not on this surface; agents copy the
 * draft for now. The send + TCPA/DNC orchestrator pattern from the
 * equity-message stack can be reused in a follow-up if needed.
 */
export default function BuyerOutreachDraftModal(props: {
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

  useEffect(() => {
    if (!props.open || !props.contactId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDraft(null);
    setCopied(null);

    (async () => {
      try {
        const res = await fetch(
          `/api/dashboard/sphere/likely-buyers/${encodeURIComponent(props.contactId!)}/outreach-message`,
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
            <div className="text-base font-semibold text-slate-900">{t("pages.draftModal.buyerTitle")}</div>
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
                <p className="text-[11px] text-slate-500">{draft.sms.length} / 320 chars</p>
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
          <footer className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/40 px-5 py-3">
            <div className="text-[11px] text-slate-500">
              {draft.aiPowered
                ? "Drafted by AI · review before sending"
                : "Template draft (no AI key) · personalize before sending"}
            </div>
            <button
              type="button"
              onClick={copyCurrent}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              {copied === channel ? "Copied!" : channel === "sms" ? "Copy SMS" : "Copy email"}
            </button>
          </footer>
        ) : null}
      </div>
    </div>
  );
}
