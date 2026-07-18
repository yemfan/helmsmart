"use client";

import { useState } from "react";

export function AiEmailComposer({
  leadId,
  to,
  defaultSubject = "",
  defaultBody = "",
  onSent,
}: {
  leadId: string;
  to: string;
  defaultSubject?: string;
  /** Optional pre-filled body (e.g. a market-report share link). */
  defaultBody?: string;
  onSent?: () => void;
}) {
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    try {
      setLoading(true);
      setError("");
      const res = await fetch("/api/ai-email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, to, subject, body }),
      });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !json?.success) throw new Error(json?.error || "Failed to send email");
      setBody("");
      onSent?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setLoading(false);
    }
  }

  const disabled = loading || !subject.trim() || !body.trim() || !to.trim();

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-base font-semibold text-slate-900">Send email</h2>
      </div>
      <div className="space-y-3 p-5">
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
          placeholder="Subject"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="min-h-[160px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
          placeholder="Write an email…"
        />
        {error ? <div className="text-sm text-red-600">{error}</div> : null}
        <button
          type="button"
          onClick={() => void send()}
          disabled={disabled}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:bg-slate-300"
        >
          {loading ? "Sending…" : "Send email"}
        </button>
      </div>
    </section>
  );
}
