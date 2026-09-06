"use client";

import { useState } from "react";
import { CalendarCheck, Mail, PhoneCall } from "lucide-react";
import type { HubTheme } from "./theme";
import { BTN } from "./theme";
import { trackHubEvent } from "./hubEvents";
import { useTurnstile } from "./HubTurnstile";

/**
 * The contact form — one of several ways a hub visitor becomes a lead, and
 * the one that needs no AI. Sits beside the direct channels (call, email,
 * book) so a visitor who would rather not type has somewhere to go.
 *
 * Every label arrives as a prop: this is a client component and the server
 * holds the translator. The consent checkbox is not decoration — the number
 * typed here can reach an autodialer and an SMS sender, so the exact
 * disclosure the visitor saw is recorded server-side against a pinned
 * version. Unticked is a complete, valid submission.
 */

type Labels = {
  title: string;
  blurb: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  intent: string;
  intents: Record<string, string>;
  consent: string;
  submit: string;
  submitting: string;
  thanksTitle: string;
  thanksBody: string;
  errorGeneric: string;
  errorName: string;
  errorContact: string;
  orCall: string;
  orEmail: string;
  orBook: string;
};

export default function HubLeadForm({
  username,
  utmSource,
  utmCampaign,
  labels,
  theme,
  phone,
  email,
  bookingHref,
  locale,
}: {
  username: string;
  utmSource: string | null;
  utmCampaign: string | null;
  labels: Labels;
  theme: HubTheme;
  phone: string | null;
  email: string | null;
  bookingHref: string | null;
  locale: string;
}) {
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const { getToken } = useTurnstile();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const emailV = String(form.get("email") ?? "").trim();
    const phoneV = String(form.get("phone") ?? "").trim();
    if (!name) return setError(labels.errorName);
    if (!emailV && !phoneV) return setError(labels.errorContact);

    setError(null);
    setState("sending");
    try {
      const turnstileToken = await getToken();
      const res = await fetch(`/api/public/hub/${encodeURIComponent(username)}/lead`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          channel: "form",
          name,
          email: emailV,
          phone: phoneV,
          message: String(form.get("message") ?? "").trim(),
          intent: String(form.get("intent") ?? "") || null,
          smsConsent: form.get("consent") === "on",
          utmSource,
          utmCampaign,
          locale,
          turnstileToken,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      trackHubEvent(username, "lead_created", { channel: "form" }, { forwardOnly: true });
      setState("done");
    } catch {
      setState("idle");
      setError(labels.errorGeneric);
    }
  }

  const field =
    "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200 sm:py-2.5 sm:text-sm";
  const label = "block text-sm font-medium text-slate-700";

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="rounded-2xl bg-white p-6 shadow-[var(--shadow-raised)] ring-1 ring-slate-200 sm:p-8">
        {state === "done" ? (
          <div role="status">
            <h3 className="text-xl font-semibold text-slate-900">{labels.thanksTitle}</h3>
            <p className="mt-2 text-slate-600">{labels.thanksBody}</p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="grid gap-4" noValidate>
            <label className={label}>
              {labels.name}
              <input name="name" className={field} autoComplete="name" required />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={label}>
                {labels.email}
                <input name="email" type="email" inputMode="email" className={field} autoComplete="email" />
              </label>
              <label className={label}>
                {labels.phone}
                <input name="phone" type="tel" inputMode="tel" className={field} autoComplete="tel" />
              </label>
            </div>
            <label className={label}>
              {labels.intent}
              <select name="intent" className={field} defaultValue="">
                <option value="">—</option>
                {Object.entries(labels.intents).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              {labels.message}
              <textarea name="message" rows={3} className={field} />
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
            <button
              type="submit"
              disabled={state === "sending"}
              onClick={() => trackHubEvent(username, "hero_cta_click", { action: "contact", label: "form" })}
              className={`${BTN} ${theme.primary} ${theme.ring} w-full disabled:opacity-60 sm:w-auto sm:justify-self-start`}
            >
              {state === "sending" ? labels.submitting : labels.submit}
            </button>
          </form>
        )}
      </div>
      {phone || email || bookingHref ? (
        <aside className="flex flex-col gap-3">
          {phone ? (
            <a
              href={`tel:${phone.replace(/[^\d+]/g, "")}`}
              onClick={() => trackHubEvent(username, "hero_cta_click", { action: "call", label: "contact" })}
              className={`flex min-h-14 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 ${theme.ring}`}
            >
              <PhoneCall className={`h-5 w-5 ${theme.text}`} aria-hidden />
              <span>
                <span className="block text-xs font-normal text-slate-500">{labels.orCall}</span>
                {phone}
              </span>
            </a>
          ) : null}
          {email ? (
            <a
              href={`mailto:${email}`}
              onClick={() => trackHubEvent(username, "hero_cta_click", { action: "email", label: "contact" })}
              className={`flex min-h-14 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 ${theme.ring}`}
            >
              <Mail className={`h-5 w-5 ${theme.text}`} aria-hidden />
              <span className="min-w-0">
                <span className="block text-xs font-normal text-slate-500">{labels.orEmail}</span>
                <span className="block truncate">{email}</span>
              </span>
            </a>
          ) : null}
          {bookingHref ? (
            <a
              href={bookingHref}
              onClick={() => trackHubEvent(username, "appointment_started", { label: "contact" })}
              className={`flex min-h-14 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 ${theme.ring}`}
              {...(/^https?:/i.test(bookingHref) ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            >
              <CalendarCheck className={`h-5 w-5 ${theme.text}`} aria-hidden />
              <span>{labels.orBook}</span>
            </a>
          ) : null}
        </aside>
      ) : null}
    </div>
  );
}
