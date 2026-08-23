"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  POSTCARD_TEMPLATES,
  type PostcardTemplateKey,
} from "@/lib/postcards/templates";

type Recipient = {
  contactId: string;
  name: string;
  email: string | null;
  phone: string | null;
};

type ChannelKey = "email" | "sms" | "wechat";

type PerRecipientResult = {
  contactId: string;
  recipientName: string;
  publicUrl: string | null;
  ok: boolean;
  deliveries?: Record<ChannelKey, { ok: boolean; reason?: string }>;
  error?: string;
};

/**
 * Bulk-send variant of SendPostcardModal. Same 3-step flow
 * (pick design → compose → sent) but:
 *   - no per-recipient fields (name/email/phone pulled from the
 *     contacts; the card's title greets each one by name)
 *   - single shared personal message used for every send
 *   - progress summary at the end (N of M delivered, per-channel
 *     failures listed)
 */
export function BulkSendPostcardModal({
  open,
  onClose,
  recipients,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  recipients: Recipient[];
  onSent?: () => void;
}) {
  const { t } = useTranslation("dashboard");
  const [step, setStep] = useState<"pick" | "customize" | "sending" | "done">(
    "pick",
  );
  const [templateKey, setTemplateKey] = useState<PostcardTemplateKey>(
    "thinking_of_you",
  );
  const [message, setMessage] = useState("");
  const [channels, setChannels] = useState<Record<ChannelKey, boolean>>({
    email: true,
    sms: false,
    wechat: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<PerRecipientResult[] | null>(null);

  const template = useMemo(
    () => POSTCARD_TEMPLATES.find((t) => t.key === templateKey) ?? POSTCARD_TEMPLATES[0],
    [templateKey],
  );

  if (!open) return null;

  const pickedChannels = (Object.keys(channels) as ChannelKey[]).filter(
    (k) => channels[k],
  );

  // Heads-up counts so the agent knows "10 will ship email, 2 can't".
  const emailable = recipients.filter((r) => r.email).length;
  const smsable = recipients.filter((r) => r.phone).length;

  async function onSend() {
    setError(null);
    if (!recipients.length) {
      setError("No recipients selected.");
      return;
    }
    if (!pickedChannels.length) {
      setError("Pick at least one delivery channel.");
      return;
    }

    setStep("sending");
    try {
      const res = await fetch("/api/dashboard/postcards/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contactIds: recipients.map((r) => r.contactId),
          templateKey,
          personalMessage: message.trim() || null,
          channels: pickedChannels,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        sent?: number;
        failed?: number;
        results?: PerRecipientResult[];
        error?: string;
      };
      if (!res.ok || !body.ok || !Array.isArray(body.results)) {
        setError(body.error ?? "Bulk send failed.");
        setStep("customize");
        return;
      }
      setResults(body.results);
      setStep("done");
      onSent?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
      setStep("customize");
    }
  }

  const doneSummary = useMemo(() => {
    if (!results) return null;
    const okCount = results.filter((r) => r.ok).length;
    const emailOk = results.filter((r) => r.deliveries?.email?.ok).length;
    const smsOk = results.filter((r) => r.deliveries?.sms?.ok).length;
    const failures = results.filter((r) => !r.ok || !r.deliveries);
    return { okCount, emailOk, smsOk, failures };
  }, [results]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              {t("pages.bulkPostcard.sendToN", {
                count: recipients.length,
                unit: t(recipients.length === 1 ? "pages.bulkPostcard.person" : "pages.bulkPostcard.people"),
              })}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {step === "pick"
                ? t("pages.bulkSendPostcard.pickADesign")
                : step === "customize"
                  ? `${template.title} — shared message for all`
                  : step === "sending"
                    ? t("common:status.sending")
                    : "Sent ✓"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700"
            aria-label={t("pages.sendPostcard.close")}
            disabled={step === "sending"}
          >
            ✕
          </button>
        </div>

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

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-semibold text-slate-700">
                  {t("pages.bulkPostcard.recipientsN", { count: recipients.length })}
                </div>
                <div className="mt-1 text-[11px] text-slate-500">{t("pages.bulkPostcard.greetsByName")}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {recipients.slice(0, 8).map((r) => (
                    <span
                      key={r.contactId}
                      className="rounded-full bg-white px-2.5 py-0.5 text-[11px] text-slate-700 ring-1 ring-slate-200"
                    >
                      {r.name}
                    </span>
                  ))}
                  {recipients.length > 8 ? (
                    <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] text-slate-500 ring-1 ring-slate-200">
                      +{recipients.length - 8} more
                    </span>
                  ) : null}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">{t("pages.sendPostcard.personalMessage")}</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder={template.defaultMessage}
                />
                <p className="mt-1 text-[11px] text-slate-500">{t("pages.bulkPostcard.messageHint")}</p>
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
                    ✉️ Email{" "}
                    <span className="text-[11px] text-slate-500">
                      {t("pages.bulkPostcard.haveEmail", { count: emailable })}
                    </span>
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
                    💬 SMS{" "}
                    <span className="text-[11px] text-slate-500">
                      {t("pages.bulkPostcard.havePhone", { count: smsable })}
                    </span>
                  </label>
                  <label
                    className="flex items-center gap-2 text-slate-400"
                    title={t("pages.sendPostcard.wechatSoon")}
                  >
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
          ) : step === "sending" ? (
            <div className="flex flex-col items-center py-12 text-center">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />
              <p className="mt-4 text-sm text-slate-600">
                {t("pages.bulkPostcard.sendingN", { count: recipients.length })}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">{t("pages.bulkPostcard.takesSeconds")}</p>
            </div>
          ) : doneSummary && results ? (
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-5xl">🎉</div>
                <h3 className="mt-2 text-lg font-semibold text-slate-900">
                  {t("pages.bulkPostcard.sentNofM", { ok: doneSummary.okCount, total: results.length })}
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">{t("pages.bulkPostcard.emailSent")}</div>
                  <div className="text-xl font-bold text-emerald-900">
                    {doneSummary.emailOk}
                  </div>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">{t("pages.bulkPostcard.smsSent")}</div>
                  <div className="text-xl font-bold text-emerald-900">
                    {doneSummary.smsOk}
                  </div>
                </div>
              </div>
              {doneSummary.failures.length ? (
                <div>
                  <div className="text-xs font-semibold text-slate-700">
                    {t("pages.bulkPostcard.notDelivered", { count: doneSummary.failures.length })}
                  </div>
                  <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto text-xs">
                    {doneSummary.failures.map((f) => (
                      <li
                        key={f.contactId}
                        className="flex items-center justify-between rounded border border-amber-200 bg-amber-50 px-2 py-1 text-amber-900"
                      >
                        <span>{f.recipientName}</span>
                        <span className="text-[11px] opacity-75">
                          {f.error || "missing contact info"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

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
              disabled={!pickedChannels.length}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {t("pages.bulkPostcard.sendN", { count: recipients.length })}
            </button>
          </div>
        ) : step === "done" ? (
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
