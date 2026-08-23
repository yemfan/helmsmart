"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

export function OutboundSmsComposer({
  leadId,
  to,
  defaultBody = "",
  onSent,
}: {
  leadId: string;
  to: string;
  /** Optional pre-filled body (e.g. a market-report share link). */
  defaultBody?: string;
  onSent?: () => void;
}) {
  const { t } = useTranslation("dashboard");
  const [body, setBody] = useState(defaultBody);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    try {
      setLoading(true);
      setError("");
      const res = await fetch("/api/ai-sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, to, body }),
      });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !json?.success) throw new Error(json?.error || "Failed to send SMS");
      setBody("");
      onSent?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send SMS");
    } finally {
      setLoading(false);
    }
  }

  const disabled = loading || !body.trim() || !to.trim();

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-base font-semibold text-slate-900">{t("pages.misc.sendSms")}</h2>
        <p className="text-xs text-slate-500 mt-0.5">{t("pages.misc.twilioNote")}</p>
      </div>
      <div className="space-y-3 p-5">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="min-h-[100px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
          placeholder={t("pages.aiComposer.writeText")}
        />
        {error ? <div className="text-sm text-red-600">{error}</div> : null}
        <button
          type="button"
          onClick={() => void send()}
          disabled={disabled}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:bg-slate-300"
        >
          {loading ? t("common:status.sending") : t("pages.outboundSmsComposer.sendSms")}
        </button>
      </div>
    </section>
  );
}
