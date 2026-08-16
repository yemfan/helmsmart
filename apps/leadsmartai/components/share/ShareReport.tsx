"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Unified "Share" control for every report type (Deep Report, CMA,
 * Comparison, Presentation) so sharing is consistent across the app.
 *
 * One button → a popover with:
 *   - Copy link        (the public share URL)
 *   - Email            (to a CRM contact via Resend, or a typed address via mailto:)
 *   - Text             (to a CRM contact via Twilio, or a typed number via sms:)
 *   - Download PDF      (client html2canvas callback, or a server PDF href)
 *
 * Sending to a CRM contact reuses /api/ai-email/send + /api/ai-sms/send, so it
 * lands in the contact's timeline and feeds the lead rating. A free-typed
 * email/phone (no contact) falls back to the device's mail/SMS app, since
 * those endpoints are contact-bound.
 */

type ReachableContact = { id: string; name: string; phone: string; email: string };

type Channel = "email" | "sms";

export type ShareReportProps = {
  /** Public share URL. When absent, link/email/text are hidden (only Download). */
  shareUrl?: string | null;
  /** Client-side PDF generator (html2canvas reports). */
  onDownloadPdf?: () => void | Promise<void>;
  /** Server-rendered PDF link (e.g. CMA /pdf). Used when onDownloadPdf is absent. */
  downloadHref?: string;
  /** Email subject + basis for the prefilled message. */
  subject: string;
  /** Short noun phrase for the message body, e.g. "the property report for 148 W Cherry Ave". */
  resourceLabel?: string;
  className?: string;
};

export default function ShareReport({
  shareUrl,
  onDownloadPdf,
  downloadHref,
  subject,
  resourceLabel,
  className,
}: ShareReportProps) {
  const { t } = useTranslation("dashboard");
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [contacts, setContacts] = useState<ReachableContact[] | null>(null);
  const [contactId, setContactId] = useState("");
  const [manualTo, setManualTo] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [copied, setCopied] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const hasLink = Boolean(shareUrl);
  const canDownload = Boolean(onDownloadPdf || downloadHref);
  const label = resourceLabel ?? "this report";

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const defaultMessage = useCallback(
    (ch: Channel) =>
      ch === "sms"
        ? `Hi — here's ${label}: ${shareUrl ?? ""}`
        : `Hi,\n\nHere's ${label}:\n${shareUrl ?? ""}\n\nHappy to walk you through it — just let me know.`,
    [label, shareUrl],
  );

  const openChannel = useCallback(
    async (ch: Channel) => {
      setChannel(ch);
      setStatus("idle");
      setStatusMsg("");
      setContactId("");
      setManualTo("");
      setMessage(defaultMessage(ch));
      if (contacts === null) {
        try {
          const res = await fetch("/api/dashboard/contacts/reachable", { cache: "no-store" });
          const data = (await res.json().catch(() => ({}))) as { contacts?: ReachableContact[] };
          setContacts(Array.isArray(data.contacts) ? data.contacts : []);
        } catch {
          setContacts([]);
        }
      }
    },
    [contacts, defaultMessage],
  );

  const onCopy = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy this link:", shareUrl);
    }
  }, [shareUrl]);

  const onDownload = useCallback(async () => {
    if (onDownloadPdf) {
      await onDownloadPdf();
    } else if (downloadHref) {
      window.open(downloadHref, "_blank", "noopener");
    }
    setOpen(false);
  }, [onDownloadPdf, downloadHref]);

  const selectableContacts = (contacts ?? []).filter((c) =>
    channel === "sms" ? c.phone : c.email,
  );
  const selected = selectableContacts.find((c) => c.id === contactId) ?? null;

  const onSend = useCallback(async () => {
    if (!channel) return;
    const body = message.trim();
    if (!body) {
      setStatus("error");
      setStatusMsg("Add a message first.");
      return;
    }

    // Free-typed recipient (no contact) → hand off to the device mail/SMS app.
    if (!selected) {
      const to = manualTo.trim();
      if (!to) {
        setStatus("error");
        setStatusMsg("Pick a contact or enter an address/number.");
        return;
      }
      const href =
        channel === "sms"
          ? `sms:${encodeURIComponent(to)}?&body=${encodeURIComponent(body)}`
          : `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.open(href, "_blank");
      setStatus("sent");
      setStatusMsg(channel === "sms" ? "Opened your messaging app." : "Opened your email app.");
      return;
    }

    // CRM contact → server send (logged + feeds the lead rating).
    const to = channel === "sms" ? selected.phone : selected.email;
    setStatus("sending");
    setStatusMsg("");
    try {
      const url = channel === "sms" ? "/api/ai-sms/send" : "/api/ai-email/send";
      const payload =
        channel === "sms"
          ? { leadId: selected.id, to, body }
          : { leadId: selected.id, to, subject, body };
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || data.success === false) throw new Error(data.error ?? `HTTP ${res.status}`);
      setStatus("sent");
      setStatusMsg(`Sent to ${selected.name}.`);
    } catch (e) {
      setStatus("error");
      setStatusMsg(e instanceof Error ? e.message : "Failed to send.");
    }
  }, [channel, message, selected, manualTo, subject]);

  if (!hasLink && !canDownload) return null;

  return (
    <div ref={wrapRef} className={`relative inline-block ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
        aria-haspopup="true"
        aria-expanded={open}
      >{t("pages.shareReport.share")}<span aria-hidden className="text-xs">▾</span>
      </button>

      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-2 text-sm shadow-lg">
          {!channel ? (
            <div className="flex flex-col">
              {hasLink ? (
                <>
                  <MenuItem onClick={onCopy}>{copied ? "✓ Link copied" : "Copy link"}</MenuItem>
                  <MenuItem onClick={() => void openChannel("email")}>Email…</MenuItem>
                  <MenuItem onClick={() => void openChannel("sms")}>Text…</MenuItem>
                </>
              ) : null}
              {canDownload ? <MenuItem onClick={() => void onDownload()}>{t("pages.shareReport.downloadPdf")}</MenuItem> : null}
            </div>
          ) : (
            <div className="p-1">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {channel === "sms" ? "Text a link" : "Email a link"}
                </span>
                <button
                  type="button"
                  onClick={() => setChannel(null)}
                  className="text-xs font-medium text-slate-500 hover:text-slate-700"
                >
                  ← Back
                </button>
              </div>

              <label className="block text-xs text-slate-600">{t("pages.shareReport.contact")}<select
                  value={contactId}
                  onChange={(e) => {
                    setContactId(e.target.value);
                    setStatus("idle");
                    setStatusMsg("");
                  }}
                  className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                >
                  <option value="">
                    {contacts === null ? "Loading contacts…" : "Enter manually…"}
                  </option>
                  {selectableContacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({channel === "sms" ? c.phone : c.email})
                    </option>
                  ))}
                </select>
              </label>

              {!selected ? (
                <input
                  value={manualTo}
                  onChange={(e) => setManualTo(e.target.value)}
                  placeholder={channel === "sms" ? "Phone number" : "Email address"}
                  inputMode={channel === "sms" ? "tel" : "email"}
                  className="mt-2 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                />
              ) : null}

              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={channel === "sms" ? 3 : 5}
                className="mt-2 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />

              {statusMsg ? (
                <p className={`mt-1 text-xs ${status === "error" ? "text-rose-600" : "text-emerald-700"}`}>
                  {statusMsg}
                </p>
              ) : null}

              <button
                type="button"
                onClick={() => void onSend()}
                disabled={status === "sending"}
                className="mt-2 w-full rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-60"
              >
                {status === "sending"
                  ? "Sending…"
                  : selected
                    ? `Send ${channel === "sms" ? "text" : "email"}`
                    : channel === "sms"
                      ? "Open messaging app"
                      : "Open email app"}
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
    >
      {children}
    </button>
  );
}
