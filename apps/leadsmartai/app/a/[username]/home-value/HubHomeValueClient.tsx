"use client";

import { useState } from "react";
import { Check, Home } from "lucide-react";
import { trackHubEvent } from "../hubEvents";
import { useTurnstile } from "../HubTurnstile";
import { BTN, type HubTheme } from "../theme";

/**
 * The home-value funnel, on the agent's own page.
 *
 *   address → estimate → contact details → the agent gets a seller lead
 *
 * The estimate comes from the platform's existing engine
 * (`POST /api/property/estimate`, which already serves signed-out visitors);
 * the lead goes through the hub's own capture path so it lands in THIS
 * agent's CRM with the address and the number the visitor saw. The visitor
 * sees the range before being asked for anything — an estimate behind a
 * form is a form, and forms get fake numbers.
 */

type Estimate = { value: number | null; low: number | null; high: number | null; summary: string | null };

type Labels = {
  address: string;
  addressPlaceholder: string;
  estimate: string;
  estimating: string;
  estimateFailed: string;
  estimateTitle: string;
  rangeLabel: string;
  unlockTitle: string;
  unlockBody: string;
  unlockCta: string;
  doneTitle: string;
  doneBody: string;
  disclaimer: string;
  name: string;
  email: string;
  phone: string;
  consent: string;
  submitting: string;
  errorName: string;
  errorContact: string;
  errorGeneric: string;
  steps: { address: string; estimate: string; report: string };
};

function money(n: number | null): string {
  return n == null || !Number.isFinite(n) ? "—" : `$${Math.round(n).toLocaleString()}`;
}

export default function HubHomeValueClient({
  username,
  labels,
  theme,
  locale,
}: {
  username: string;
  labels: Labels;
  theme: HubTheme;
  locale: string;
}) {
  const [address, setAddress] = useState("");
  const [step, setStep] = useState<"address" | "estimate" | "done">("address");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const { getToken } = useTurnstile();

  async function runEstimate(e: React.FormEvent) {
    e.preventDefault();
    const addr = address.trim();
    if (addr.length < 4) return;
    setError(null);
    setBusy(true);
    trackHubEvent(username, "home_value_started", { label: "funnel" });
    try {
      const res = await fetch("/api/property/estimate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ address: addr, likelyIntent: "seller" }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        estimate?: { estimatedValue?: number | null; low?: number | null; high?: number | null; summary?: string | null };
      };
      if (!res.ok || json.ok === false || !json.estimate) throw new Error("estimate");
      setEstimate({
        value: json.estimate.estimatedValue ?? null,
        low: json.estimate.low ?? null,
        high: json.estimate.high ?? null,
        summary: json.estimate.summary ?? null,
      });
      setStep("estimate");
    } catch {
      setError(labels.estimateFailed);
    } finally {
      setBusy(false);
    }
  }

  async function submitLead(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim();
    if (!name) return setError(labels.errorName);
    if (!email && !phone) return setError(labels.errorContact);
    setError(null);
    setBusy(true);
    try {
      const turnstileToken = await getToken();
      const res = await fetch(`/api/public/hub/${encodeURIComponent(username)}/lead`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          channel: "home_value",
          tool: "home_value",
          name,
          email,
          phone,
          intent: "sell",
          propertyAddress: address.trim(),
          estimatedValue: estimate?.value ?? null,
          estimateLow: estimate?.low ?? null,
          estimateHigh: estimate?.high ?? null,
          smsConsent: form.get("consent") === "on",
          locale,
          turnstileToken,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      trackHubEvent(username, "home_value_completed", { label: "funnel" });
      trackHubEvent(username, "lead_created", { channel: "home_value" }, { forwardOnly: true });
      setStep("done");
    } catch {
      setError(labels.errorGeneric);
    } finally {
      setBusy(false);
    }
  }

  const field =
    "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200 sm:py-2.5 sm:text-sm";
  const label = "block text-sm font-medium text-slate-700";
  const steps = [labels.steps.address, labels.steps.estimate, labels.steps.report];
  const active = step === "address" ? 0 : step === "estimate" ? 1 : 2;

  return (
    <div className="rounded-2xl bg-white p-6 shadow-[var(--shadow-raised)] ring-1 ring-slate-200 sm:p-8">
      <ol className="mb-6 flex items-center gap-2 text-xs font-medium text-slate-500" aria-label={labels.steps.address}>
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${
                i < active ? theme.primary : i === active ? theme.tint : "bg-slate-100 text-slate-500"
              }`}
              aria-current={i === active ? "step" : undefined}
            >
              {i < active ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
            </span>
            <span className={i === active ? "text-slate-900" : ""}>{s}</span>
            {i < steps.length - 1 ? <span className="h-px w-4 bg-slate-200 sm:w-8" aria-hidden /> : null}
          </li>
        ))}
      </ol>

      {step === "address" ? (
        <form onSubmit={runEstimate} className="grid gap-4">
          <label className={label}>
            {labels.address}
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={labels.addressPlaceholder}
              autoComplete="street-address"
              className={field}
              required
              data-hub-focus
            />
          </label>
          {error ? (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <button type="submit" disabled={busy || address.trim().length < 4} className={`${BTN} ${theme.primary} ${theme.ring} w-full disabled:opacity-60 sm:w-auto sm:justify-self-start`}>
            <Home className="h-4 w-4" aria-hidden />
            {busy ? labels.estimating : labels.estimate}
          </button>
          {busy ? (
            <p className="text-sm text-slate-500" role="status">
              {labels.estimating}
            </p>
          ) : null}
        </form>
      ) : null}

      {step === "estimate" && estimate ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <p className="text-sm text-slate-500">{address}</p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.estimateTitle}</p>
            <p className="mt-1 text-4xl font-semibold tracking-tight text-slate-900">{money(estimate.value)}</p>
            {estimate.low && estimate.high ? (
              <p className="mt-1 text-sm text-slate-600">
                {labels.rangeLabel} {money(estimate.low)} – {money(estimate.high)}
              </p>
            ) : null}
            {estimate.summary ? <p className="mt-3 text-sm leading-relaxed text-slate-600">{estimate.summary}</p> : null}
            <p className="mt-4 text-xs text-slate-500">{labels.disclaimer}</p>
          </div>
          <form onSubmit={submitLead} className="grid gap-4 rounded-2xl bg-slate-50 p-5 ring-1 ring-slate-200" noValidate>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{labels.unlockTitle}</h2>
              <p className="mt-1 text-sm text-slate-600">{labels.unlockBody}</p>
            </div>
            <label className={label}>
              {labels.name}
              <input name="name" className={field} autoComplete="name" required />
            </label>
            <label className={label}>
              {labels.email}
              <input name="email" type="email" inputMode="email" className={field} autoComplete="email" />
            </label>
            <label className={label}>
              {labels.phone}
              <input name="phone" type="tel" inputMode="tel" className={field} autoComplete="tel" />
            </label>
            <label className="flex items-start gap-3 text-sm text-slate-600">
              <input type="checkbox" name="consent" className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300" />
              <span>{labels.consent}</span>
            </label>
            {error ? (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            ) : null}
            <button type="submit" disabled={busy} className={`${BTN} ${theme.primary} ${theme.ring} w-full disabled:opacity-60`}>
              {busy ? labels.submitting : labels.unlockCta}
            </button>
          </form>
        </div>
      ) : null}

      {step === "done" ? (
        <div role="status" className="text-center sm:py-6">
          <span className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${theme.tint}`}>
            <Check className="h-6 w-6" aria-hidden />
          </span>
          <h2 className="mt-4 text-xl font-semibold text-slate-900">{labels.doneTitle}</h2>
          <p className="mx-auto mt-2 max-w-md text-slate-600">{labels.doneBody}</p>
        </div>
      ) : null}
    </div>
  );
}
