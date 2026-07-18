"use client";

import { useState } from "react";

import { AiEmailComposer } from "@/components/crm/AiEmailComposer";
import { OutboundSmsComposer } from "@/components/crm/OutboundSmsComposer";

/**
 * "Send market report" action for a contact.
 *
 * Flow: POST /api/market-report/create with the contactId → get a shareable
 * link → open the EXISTING email/SMS composer pre-filled with a short,
 * client-friendly message containing the link. Reuses the composer's own send
 * path (/api/ai-email/send · /api/ai-sms/send) — no new send pipeline.
 */

type Channel = "email" | "sms";

export function SendMarketReportButton({
  contactId,
  firstName,
  email,
  phone,
  city,
}: {
  contactId: string;
  firstName?: string | null;
  email?: string | null;
  phone?: string | null;
  /** Only used to phrase the subject/body; the server re-matches by contact. */
  city?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [matchedCity, setMatchedCity] = useState<string | null>(null);
  const [channel, setChannel] = useState<Channel>(email ? "email" : "sms");

  // Prefer the market the server actually matched (returned by the API) so the
  // subject/body name the SAME place as the linked report; the `city` prop is
  // only a pre-request hint.
  const displayCity = (matchedCity ?? city ?? "").trim();
  const cityLabel = displayCity || "your area";
  const hi = firstName?.trim() ? `Hi ${firstName.trim()}, ` : "Hi, ";
  const subject = `${displayCity || "Local"} market update`;
  const body =
    shareUrl != null
      ? `${hi}here's the latest ${cityLabel} market snapshot — home values, prices, and days on market: ${shareUrl}. Happy to talk through what it means for you.`
      : "";

  async function generate() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/market-report/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        shareUrl?: string;
        city?: string;
        error?: string;
      };
      if (!res.ok || !json?.ok || !json.shareUrl) {
        throw new Error(json?.error || "Could not build the market report.");
      }
      setShareUrl(json.shareUrl);
      if (json.city) setMatchedCity(json.city);
      setChannel(email ? "email" : "sms");
      setOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build the market report.");
    } finally {
      setLoading(false);
    }
  }

  function close() {
    setOpen(false);
    setShareUrl(null);
    setMatchedCity(null);
    setError(null);
  }

  const canEmail = Boolean(email);
  const canSms = Boolean(phone);

  return (
    <>
      <button
        type="button"
        onClick={() => void generate()}
        disabled={loading || (!canEmail && !canSms)}
        className="rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        {loading ? "Building report…" : "Send market report"}
      </button>
      {error && !open ? (
        <span className="self-center text-xs font-medium text-red-600">{error}</span>
      ) : null}

      {open && shareUrl ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          onClick={close}
        >
          <div
            className="w-full max-w-lg space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="text-sm font-semibold text-slate-900">Send market report</div>
              <button
                type="button"
                onClick={close}
                className="text-sm text-slate-500 hover:text-slate-800"
              >
                Close
              </button>
            </div>

            {canEmail && canSms ? (
              <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => setChannel("email")}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    channel === "email" ? "bg-slate-900 text-white" : "text-slate-600"
                  }`}
                >
                  Email
                </button>
                <button
                  type="button"
                  onClick={() => setChannel("sms")}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    channel === "sms" ? "bg-slate-900 text-white" : "text-slate-600"
                  }`}
                >
                  Text
                </button>
              </div>
            ) : null}

            {channel === "email" && canEmail ? (
              <AiEmailComposer
                leadId={contactId}
                to={email as string}
                defaultSubject={subject}
                defaultBody={body}
                onSent={close}
              />
            ) : canSms ? (
              <OutboundSmsComposer
                leadId={contactId}
                to={phone as string}
                defaultBody={body}
                onSent={close}
              />
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                Add an email or phone number for this contact to send the report.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
