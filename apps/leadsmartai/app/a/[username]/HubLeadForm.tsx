"use client";

import { useState } from "react";

/**
 * The one place a hub visitor becomes a lead.
 *
 * Every label arrives as a prop rather than being read here, because this is a
 * client component and the server already holds the translator — passing the
 * strings down keeps one translation path instead of shipping a second
 * i18n bundle to a public page that should stay light.
 *
 * The consent checkbox is not decoration. The number typed here can reach an
 * autodialer and an SMS sender, so the exact disclosure the visitor saw is
 * recorded server-side against a pinned version. Unticked is a complete,
 * valid submission — it means "email me, do not text me", which is a normal
 * thing to want and must not block the enquiry.
 */

type Labels = {
  title: string;
  blurb: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  consent: string;
  submit: string;
  submitting: string;
  thanksTitle: string;
  thanksBody: string;
  errorGeneric: string;
  errorName: string;
  errorContact: string;
};

export default function HubLeadForm({
  username,
  utmSource,
  utmCampaign,
  labels,
}: {
  username: string;
  utmSource: string | null;
  utmCampaign: string | null;
  labels: Labels;
}) {
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  if (state === "done") {
    return (
      <div className="rounded-xl bg-white p-6 ring-1 ring-slate-200">
        <h2 className="text-xl font-semibold">{labels.thanksTitle}</h2>
        <p className="mt-2 text-slate-600">{labels.thanksBody}</p>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim();

    // Checked here as well as on the server so the visitor is told what to fix
    // without a round trip. The server does not trust any of it.
    if (!name) return setError(labels.errorName);
    if (!email && !phone) return setError(labels.errorContact);

    setError(null);
    setState("sending");
    try {
      const res = await fetch(`/api/public/hub/${encodeURIComponent(username)}/lead`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone,
          message: String(form.get("message") ?? "").trim(),
          smsConsent: form.get("consent") === "on",
          utmSource,
          utmCampaign,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setState("done");
    } catch {
      setState("idle");
      setError(labels.errorGeneric);
    }
  }

  const field =
    "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200";

  return (
    <div className="rounded-xl bg-white p-6 ring-1 ring-slate-200">
      <h2 className="text-xl font-semibold">{labels.title}</h2>
      <p className="mt-1 text-slate-600">{labels.blurb}</p>

      <form onSubmit={onSubmit} className="mt-5 grid gap-4">
        <label className="block text-sm font-medium text-slate-700">
          {labels.name}
          <input name="name" className={field} autoComplete="name" required />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
            {labels.email}
            <input name="email" type="email" className={field} autoComplete="email" />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            {labels.phone}
            <input name="phone" type="tel" className={field} autoComplete="tel" />
          </label>
        </div>

        <label className="block text-sm font-medium text-slate-700">
          {labels.message}
          <textarea name="message" rows={3} className={field} />
        </label>

        <label className="flex items-start gap-3 text-sm text-slate-600">
          <input type="checkbox" name="consent" className="mt-1 h-4 w-4 shrink-0" />
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
          className="justify-self-start rounded-lg bg-slate-900 px-5 py-2.5 font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {state === "sending" ? labels.submitting : labels.submit}
        </button>
      </form>
    </div>
  );
}
