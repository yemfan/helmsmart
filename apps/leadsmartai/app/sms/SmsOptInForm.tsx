"use client";

import { useState } from "react";
import { SMS_CONSENT_TEXT } from "./consent";

function formatUsPhone(input: string): string {
  const d = input.replace(/\D/g, "").slice(0, 10);
  if (!d) return "";
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export default function SmsOptInForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  // Unchecked by default — active consent is required (A2P 30925).
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setError(null);
    if (phone.replace(/\D/g, "").length !== 10) {
      setError("Enter a valid 10-digit US phone number.");
      return;
    }
    if (!consent) {
      setError("Please check the box to agree to receive text messages.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/sms/opt-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || null, phone, email: email.trim() || null, consent }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Could not submit. Please try again.");
      setDone(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not submit. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-800">
        <p className="font-semibold">You&apos;re subscribed.</p>
        <p className="mt-1">
          Thanks — you&apos;ll receive text messages at the number you provided. Reply{" "}
          <strong>STOP</strong> at any time to unsubscribe, or <strong>HELP</strong> for help.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name (optional)"
        className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0072ce]"
      />
      <input
        value={phone}
        onChange={(e) => setPhone(formatUsPhone(e.target.value))}
        placeholder="Mobile phone (required)"
        inputMode="tel"
        className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0072ce]"
      />
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email (optional)"
        inputMode="email"
        className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0072ce]"
      />

      <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-snug text-slate-700">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-4 w-4 flex-shrink-0"
        />
        <span>{SMS_CONSENT_TEXT}</span>
      </label>

      <button
        type="button"
        onClick={submit}
        disabled={loading}
        className="w-full rounded-xl bg-[#0072ce] px-4 py-3 text-sm font-semibold text-white hover:bg-[#005fa8] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Submitting…" : "Sign up for text updates"}
      </button>

      {error ? <p className="text-xs font-medium text-red-600">{error}</p> : null}
    </div>
  );
}
