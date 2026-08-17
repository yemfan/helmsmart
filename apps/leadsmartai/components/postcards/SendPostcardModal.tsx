"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import {
  POSTCARD_TEMPLATES,
  type PostcardTemplateKey,
} from "@/lib/postcards/templates";

type SendTarget = {
  contactId?: string | null;
  name: string;
  email?: string | null;
  phone?: string | null;
};

type ChannelKey = "email" | "sms" | "wechat";

/**
 * Send-postcard flow — a self-contained modal that handles:
 *   1. Template pick (4 baked designs)
 *   2. Personalize: recipient + message override (template default
 *      is pre-filled)
 *   3. Channel pick (email / sms / wechat; wechat marked as "queued")
 *   4. Preview → send
 *
 * On success, shows the public URL + copy button + a link to open
 * the card. WeChat shows up as "queued for delivery when enabled"
 * so agents don't think we've already shipped that integration.
 */
export function SendPostcardModal({
  open,
  onClose,
  target,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  target: SendTarget;
  onSent?: () => void;
}) {
  const { t } = useTranslation("dashboard");
  const [step, setStep] = useState<"pick" | "customize" | "sent">("pick");
  const [templateKey, setTemplateKey] = useState<PostcardTemplateKey>("thinking_of_you");
  const [recipientName, setRecipientName] = useState(target.name);
  const [email, setEmail] = useState(target.email ?? "");
  const [phone, setPhone] = useState(target.phone ?? "");
  const [message, setMessage] = useState("");
  const [channels, setChannels] = useState<Record<ChannelKey, boolean>>({
    email: Boolean(target.email),
    sms: false,
    wechat: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentResult, setSentResult] = useState<{
    publicUrl: string;
    deliveries: Record<ChannelKey, { ok: boolean; reason?: string }>;
  } | null>(null);

  const template = useMemo(
    () => POSTCARD_TEMPLATES.find((t) => t.key === templateKey) ?? POSTCARD_TEMPLATES[0],
    [templateKey],
  );

  if (!open) return null;

  const pickedChannels = (Object.keys(channels) as ChannelKey[]).filter(
    (k) => channels[k],
  );

  async function onSend() {
    setError(null);
    if (!recipientName.trim()) {
      setError("Recipient name is required.");
      return;
    }
    if (!pickedChannels.length) {
      setError("Pick at least one delivery channel.");
      return;
    }
    if (channels.email && !email.trim()) {
      setError("Email is required when Email is checked.");
      return;
    }
    if (channels.sms && !phone.trim()) {
      setError("Phone is required when SMS is checked.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/dashboard/postcards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contactId: target.contactId ?? null,
          templateKey,
          recipientName: recipientName.trim(),
          recipientEmail: email.trim() || null,
          recipientPhone: phone.trim() || null,
          personalMessage: message.trim() || null,
          channels: pickedChannels,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        publicUrl?: string;
        deliveries?: Record<ChannelKey, { ok: boolean; reason?: string }>;
        error?: string;
      };
      if (!res.ok || !body.ok || !body.publicUrl) {
        setError(body.error ?? "Failed to send.");
        return;
      }
      setSentResult({ publicUrl: body.publicUrl, deliveries: body.deliveries ?? ({} as never) });
      setStep("sent");
      onSent?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">{t("pages.sendPostcard.title")}</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {step === "pick"
                ? "Pick a design"
                : step === "customize"
                  ? `${template.title} — personalize + send`
                  : "Sent ✓"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700"
            aria-label={t("pages.sendPostcard.close")}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] overflow-y-auto p-5">
          {step === "pick" ? (
            <div className="grid gap-3 md:grid-cols-2">
              {POSTCARD_TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => {
                    setTemplateKey(t.key);
                    setMessage(t.defaultMessage);
                    setStep("customize");
                  }}
                  className="group flex flex-col items-start gap-2 rounded-xl border border-slate-200 bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                  style={{
                    background: `linear-gradient(135deg, ${t.accentColor}18, #ffffff)`,
                  }}
                >
                  <div className="text-3xl">{t.emojiBadge}</div>
                  <div className="text-sm font-semibold text-slate-900">{t.title}</div>
                  <div className="text-xs text-slate-600">{t.tagline}</div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    {t.suggestedWhen}
                  </div>
                </button>
              ))}
            </div>
          ) : step === "customize" ? (
            <div className="space-y-4">
              <div
                className="rounded-lg border border-slate-200 p-3"
                style={{
                  background: `linear-gradient(135deg, ${template.accentColor}14, #ffffff)`,
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">{template.emojiBadge}</span>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {template.title}
                    </div>
                    <div className="text-[11px] text-slate-500">{template.tagline}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep("pick")}
                    className="ml-auto text-[11px] text-slate-500 hover:text-slate-700 hover:underline"
                  >{t("pages.sendPostcard.changeDesign")}</button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">{t("pages.sendPostcard.recipientName")}</label>
                  <input
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700">{t("pages.sendPostcard.personalMessage")}</label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={4}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder={template.defaultMessage}
                  />
                  <p className="mt-1 text-[11px] text-slate-500">{t("pages.sendPostcard.messageHint")}</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">{t("pages.sendPostcard.email")}</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder="friend@example.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">{t("pages.sendPostcard.phone")}</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder="(555) 555-5555"
                  />
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-semibold text-slate-700">{t("pages.sendPostcard.deliverVia")}</div>
                <div className="mt-2 flex flex-wrap gap-3 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={channels.email}
                      onChange={(e) =>
                        setChannels((p) => ({ ...p, email: e.target.checked }))
                      }
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    ✉️ Email
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={channels.sms}
                      onChange={(e) =>
                        setChannels((p) => ({ ...p, sms: e.target.checked }))
                      }
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    💬 SMS
                  </label>
                  <label className="flex items-center gap-2 text-slate-400" title={t("pages.sendPostcard.wechatSoon")}>
                    <input
                      type="checkbox"
                      checked={channels.wechat}
                      onChange={(e) =>
                        setChannels((p) => ({ ...p, wechat: e.target.checked }))
                      }
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    微 WeChat (soon)
                  </label>
                </div>
              </div>

              {error ? (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                  {error}
                </div>
              ) : null}
            </div>
          ) : sentResult ? (
            <div className="space-y-4 text-center">
              <div className="text-5xl">🎉</div>
              <h3 className="text-lg font-semibold text-slate-900">{t("pages.sendPostcard.onItsWay")}</h3>
              <div className="grid gap-2 text-left">
                {(Object.keys(sentResult.deliveries) as ChannelKey[]).map((ch) => {
                  const d = sentResult.deliveries[ch];
                  const reqd = channels[ch];
                  if (!reqd) return null;
                  const label =
                    ch === "email" ? "Email" : ch === "sms" ? "SMS" : "WeChat";
                  return (
                    <div
                      key={ch}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${
                        d.ok
                          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                          : "border-amber-200 bg-amber-50 text-amber-900"
                      }`}
                    >
                      <span className="font-medium">{label}</span>
                      <span>{d.ok ? "Sent ✓" : d.reason ?? "queued"}</span>
                    </div>
                  );
                })}
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-left">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t("pages.sendPostcard.publicLink")}</div>
                <div className="mt-1 break-all font-mono text-xs text-slate-800">
                  {sentResult.publicUrl}
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(sentResult.publicUrl);
                    }}
                    className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >{t("pages.sendPostcard.copyLink")}</button>
                  <Link
                    href={sentResult.publicUrl}
                    target="_blank"
                    className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >{t("pages.sendPostcard.open")}</Link>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        {step === "customize" ? (
          <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >{t("pages.sendPostcard.cancel")}</button>
            <button
              type="button"
              onClick={() => void onSend()}
              disabled={submitting || !recipientName.trim() || !pickedChannels.length}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {submitting ? "Sending…" : "Send postcard"}
            </button>
          </div>
        ) : step === "sent" ? (
          <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >{t("pages.sendPostcard.done")}</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
