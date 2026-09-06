"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export type IdxLeadAction =
  | "favorite"
  | "save_search"
  | "schedule_tour"
  | "contact_agent"
  | "view_threshold";

export type IdxLeadContext = {
  action: IdxLeadAction;
  listingId?: string | null;
  listingAddress?: string | null;
  listingPrice?: number | null;
  searchFilters?: Record<string, unknown> | null;
};

/*
 * The action IS the key. This was a Record of English copy at module scope;
 * `t` cannot reach out here, so the lookup moved to the component.
 */

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function formatUsPhone(input: string) {
  const digits = input.replace(/\D/g, "").slice(0, 10);
  if (!digits) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function isValidUsPhone(input: string) {
  return input.replace(/\D/g, "").length === 10;
}

export default function IdxLeadCaptureModal(props: {
  open: boolean;
  onClose: () => void;
  context: IdxLeadContext;
  onCaptured?: (info: { leadId: string }) => void;
}) {
  const { t } = useTranslation("dashboard");
  const copy = {
    title: t(`pages.idxCapture.action.${props.context.action}.title`),
    subtitle: t(`pages.idxCapture.action.${props.context.action}.subtitle`),
    cta: t(`pages.idxCapture.action.${props.context.action}.cta`),
  };
  const requiresPhone =
    props.context.action === "schedule_tour" || props.context.action === "contact_agent";

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [smsConsent, setSmsConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!props.open) {
      setEmail("");
      setName("");
      setPhone("");
      setSmsConsent(false);
      setLoading(false);
      setDone(false);
      setError(null);
    }
  }, [props.open]);

  async function submit() {
    setError(null);
    if (!isValidEmail(email.trim())) {
      setError("Please enter a valid email.");
      return;
    }
    if (requiresPhone && !isValidUsPhone(phone)) {
      setError("Please enter a valid US phone number.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/idx/lead-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim() || null,
          phone: phone.trim() || null,
          smsConsent,
          action: props.context.action,
          listingId: props.context.listingId ?? null,
          listingAddress: props.context.listingAddress ?? null,
          listingPrice: props.context.listingPrice ?? null,
          searchFilters: props.context.searchFilters ?? null,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; leadId?: string; error?: string };
      if (!res.ok || json.ok === false || !json.leadId) {
        throw new Error(json.error ?? "Failed to save your info.");
      }
      setDone(true);
      props.onCaptured?.({ leadId: json.leadId });
    } catch (e: any) {
      setError(e?.message ?? "Failed to save your info.");
    } finally {
      setLoading(false);
    }
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
          <div className="min-w-0">
            <div className="text-base font-semibold text-slate-900">{copy.title}</div>
            {props.context.listingAddress ? (
              <div className="mt-1 truncate text-xs text-slate-600">{props.context.listingAddress}</div>
            ) : (
              <div className="mt-1 text-xs text-slate-600">{copy.subtitle}</div>
            )}
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
          >{t("pages.idxCapture.close")}</button>
        </div>

        <div className="space-y-3 p-5">
          {done ? (
            <>
              <div className="text-sm font-semibold text-emerald-700">{t("pages.idxCapture.allSet")}</div>
              <p className="text-sm text-slate-700">{t("pages.idxCapture.agentWillReach")}</p>
              <button
                type="button"
                onClick={props.onClose}
                className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
              >{t("pages.idxCapture.keepBrowsing")}</button>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-700">{copy.subtitle}</p>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("pages.idxCapture.email")}
                inputMode="email"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("pages.idxCapture.name")}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                value={phone}
                onChange={(e) => setPhone(formatUsPhone(e.target.value))}
                placeholder={requiresPhone ? "Phone (required)" : "Phone (optional, for SMS updates)"}
                inputMode="tel"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {phone ? (
                <label className="flex items-start gap-2 text-[11px] leading-snug text-slate-600">
                  <input
                    type="checkbox"
                    checked={smsConsent}
                    onChange={(e) => setSmsConsent(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>{t("pages.idxCapture.consent")}</span>
                </label>
              ) : null}
              <button
                type="button"
                onClick={submit}
                disabled={loading}
                className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? t("common:status.saving") : copy.cta}
              </button>
              <p className="text-[11px] text-slate-500">{t("pages.idxCapture.privacyNote")}</p>
            </>
          )}
          {error ? <p className="text-xs font-medium text-red-600">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
