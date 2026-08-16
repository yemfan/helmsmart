"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

function formatUsPhone(input: string) {
  const digits = input.replace(/\D/g, "").slice(0, 10);
  if (!digits) return "";
  if (digits.length < 4) return `(${digits}`;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export default function LocalSeoLeadForm({
  title,
  source,
  addressHint,
  city,
}: {
  title: string;
  source: string;
  addressHint?: string;
  city?: string;
}) {
  const { t } = useTranslation("dashboard");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState(addressHint ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const leadQuality = useMemo(() => {
    if (phone.replace(/\D/g, "").length === 10) return "high";
    if (name.trim() && email.trim()) return "medium";
    return "low";
  }, [name, email, phone]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setOk(false);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || undefined,
          email: email.trim(),
          phone: phone.trim() || undefined,
          address: address.trim(),
          source,
          traffic_source: source,
          lead_quality: leadQuality,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to submit");

      // track conversion
      fetch("/api/traffic/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type: "conversion",
          page_path: typeof window !== "undefined" ? window.location.pathname : "/",
          city: city ?? null,
          source,
          lead_quality: leadQuality,
          metadata: { cta: title },
        }),
      }).catch(() => {});

      setOk(true);
      setName("");
      setEmail("");
      setPhone("");
    } catch (err: any) {
      setError(err?.message ?? "Unable to submit");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm text-slate-600">{t("pages.localSeoForm.intro")}</p>
      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <input
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder={t("pages.localSeoForm.address")}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          required
        />
        <input
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder={t("pages.localSeoForm.name")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder={t("pages.localSeoForm.email")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          type="email"
        />
        <input
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder={t("pages.localSeoForm.phone")}
          value={phone}
          onChange={(e) => setPhone(formatUsPhone(e.target.value))}
        />
        <button
          disabled={loading}
          className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? "Submitting..." : "Get My Free Report"}
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {ok && <p className="mt-2 text-xs text-emerald-700">{t("pages.localSeoForm.submitted")}</p>}
    </div>
  );
}

