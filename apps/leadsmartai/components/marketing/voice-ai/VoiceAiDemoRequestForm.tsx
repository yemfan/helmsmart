"use client";

import { useState } from "react";

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; reason: string };

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidUsPhone(phone: string): boolean {
  return phone.replace(/\D/g, "").length === 10;
}

function formatUsPhone(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 10);
  if (!digits) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/**
 * Agent-prospect form on the Voice AI test-drive page. Two distinct paths:
 *
 *   1. "Have it call me" — captures the agent's name + phone + email and the
 *      backend triggers an outbound AI demo call (when wired) or, until then,
 *      books a callback with the sales team.
 *   2. Implicit fallback — if the agent doesn't want a call, the same form
 *      doubles as a "request a demo" / mailing-list signup.
 *
 * TCPA: the form requires explicit consent for SMS / call before the request
 * can be submitted. The legal copy is part of the label, not buried in a
 * footer — same standard as our IDX consumer form.
 */
export default function VoiceAiDemoRequestForm() {
  const [name, setName] = useState("");
  const [brokerage, setBrokerage] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [intent, setIntent] = useState<"hear_it" | "agent_demo">("hear_it");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status.kind === "submitting") return;

    if (!name.trim()) {
      setStatus({ kind: "error", reason: "Please enter your name." });
      return;
    }
    if (!isValidUsPhone(phone)) {
      setStatus({ kind: "error", reason: "Phone must be a valid US 10-digit number." });
      return;
    }
    if (!isValidEmail(email.trim())) {
      setStatus({ kind: "error", reason: "Please enter a valid email." });
      return;
    }
    if (!consent) {
      setStatus({ kind: "error", reason: "Please agree to the TCPA consent before submitting." });
      return;
    }

    setStatus({ kind: "submitting" });
    try {
      const res = await fetch("/api/marketing/voice-ai-demo-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          brokerage: brokerage.trim() || null,
          phone: phone.trim(),
          email: email.trim().toLowerCase(),
          intent,
          consent: true,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || data.ok === false) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setStatus({ kind: "success" });
    } catch (e) {
      setStatus({
        kind: "error",
        reason: e instanceof Error ? e.message : "Something went wrong — please try again.",
      });
    }
  }

  if (status.kind === "success") {
    return (
      <section
        id="request-callback"
        className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 sm:p-8"
      >
        <h3 className="text-lg font-semibold text-emerald-900">You&apos;re on the list.</h3>
        <p className="mt-1 text-sm text-emerald-900/80">
          {intent === "hear_it"
            ? "We'll have the AI give you a call shortly. Pick up to hear how it qualifies a real-estate lead."
            : "Our team will reach out within one business day to schedule your private demo."}
        </p>
      </section>
    );
  }

  return (
    <section
      id="request-callback"
      className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
    >
      <header>
        <h3 className="text-xl font-bold text-slate-900 sm:text-2xl">Or have it call you.</h3>
        <p className="mt-1 text-sm text-slate-600">
          We&apos;ll dial you within minutes so you hear the AI from the receiving end —
          the same experience your leads will have.
        </p>
      </header>

      <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
          Your name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alex Rivera"
            className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-normal normal-case text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
          Brokerage <span className="font-medium text-slate-400">(optional)</span>
          <input
            value={brokerage}
            onChange={(e) => setBrokerage(e.target.value)}
            placeholder="Greenfield Realty"
            className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-normal normal-case text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
          Phone
          <input
            value={phone}
            onChange={(e) => setPhone(formatUsPhone(e.target.value))}
            placeholder="(555) 123-4567"
            inputMode="tel"
            className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-normal normal-case text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
          Email
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="alex@greenfield.com"
            inputMode="email"
            className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-normal normal-case text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <fieldset className="sm:col-span-2">
          <legend className="text-xs font-semibold uppercase tracking-wide text-slate-700">
            What you want
          </legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {(
              [
                {
                  value: "hear_it" as const,
                  title: "Have it call me",
                  blurb: "Live AI demo · usually within 5 min",
                },
                {
                  value: "agent_demo" as const,
                  title: "Book a private agent demo",
                  blurb: "30-min walkthrough with our team",
                },
              ]
            ).map((opt) => (
              <label
                key={opt.value}
                className={`cursor-pointer rounded-xl border px-4 py-3 transition ${
                  intent === opt.value
                    ? "border-blue-500 bg-blue-50/50 ring-2 ring-blue-200"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name="intent"
                  value={opt.value}
                  checked={intent === opt.value}
                  onChange={() => setIntent(opt.value)}
                  className="sr-only"
                />
                <div className="text-sm font-semibold text-slate-900">{opt.title}</div>
                <div className="mt-0.5 text-xs text-slate-600">{opt.blurb}</div>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex items-start gap-2 text-xs leading-relaxed text-slate-600 sm:col-span-2">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            I agree to receive calls and texts from RealtyBoss at the number provided,
            including via automated systems, for the purpose of demoing the voice AI.
            Consent is not a condition of any purchase. Reply STOP to unsubscribe.
          </span>
        </label>

        {status.kind === "error" ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 sm:col-span-2">
            {status.reason}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={status.kind === "submitting"}
          className="rounded-xl bg-blue-600 px-6 py-3 text-base font-semibold text-white shadow hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-2"
        >
          {status.kind === "submitting"
            ? "Sending…"
            : intent === "hear_it"
              ? "Have the AI call me"
              : "Request a private demo"}
        </button>
      </form>
    </section>
  );
}
