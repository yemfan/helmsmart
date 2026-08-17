"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Progressive onboarding: email → optional contact details → POST /api/leads (public).
 */
export default function ProgressiveLeadCapture({
  source = "growth_shared_result",
  headline = "Get the full report",
  className = "",
}: {
  source?: string;
  headline?: string;
  className?: string;
}) {
  const { t } = useTranslation("dashboard");
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setStep(1);
  }

  async function submitLead(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    try {
      const address =
        area.trim() || "Shared calculator result — area not specified";
      const r = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim() || undefined,
          phone: phone.trim() || undefined,
          address,
          source,
          traffic_source: source,
          lead_quality: "medium",
        }),
      });
      if (r.ok) {
        setDone(true);
        await fetch("/api/growth/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_type: "conversion",
            page_path: typeof window !== "undefined" ? window.location.pathname : "/",
            source: "progressive_capture",
            lead_quality: "medium",
          }),
        }).catch(() => {});
      }
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className={`rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 ${className}`}>{t("pages.growthCapture.thanks")}</div>
    );
  }

  if (step === 0) {
    return (
      <form
        onSubmit={submitEmail}
        className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3 ${className}`}
      >
        <div className="font-semibold text-slate-900">{headline}</div>
        <input
          type="email"
          required
          placeholder={t("pages.growthCapture.email")}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button
          type="submit"
          className="w-full rounded-xl bg-blue-600 text-white font-semibold py-2 text-sm"
        >{t("pages.growthCapture.continueCta")}</button>
      </form>
    );
  }

  return (
    <form
      onSubmit={submitLead}
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3 ${className}`}
    >
      <div className="font-semibold text-slate-900">{t("pages.growthCapture.tellMore")}</div>
      <input
        type="text"
        placeholder={t("pages.growthCapture.cityZip")}
        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
        value={area}
        onChange={(e) => setArea(e.target.value)}
      />
      <input
        type="tel"
        placeholder={t("pages.growthCapture.phone")}
        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <input
        type="text"
        placeholder={t("pages.growthCapture.name")}
        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl bg-blue-600 text-white font-semibold py-2 text-sm disabled:opacity-50"
      >
        {busy ? "Sending…" : "Submit"}
      </button>
    </form>
  );
}
