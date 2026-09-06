"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";
import Link from "next/link";
import type { Contact, ContactSignal } from "@/lib/contacts/types";

export type SignalWithContact = ContactSignal & { contact: Contact };

export default function SphereSignalsList({ signals: initial }: { signals: SignalWithContact[] }) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [signals, setSignals] = useState(initial);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(
    id: string,
    action: "acknowledge" | "dismiss",
    onSuccess: (s: SignalWithContact[]) => SignalWithContact[],
  ) {
    setPendingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/sphere/signals/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || `${action} failed`);
      setSignals(onSuccess);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : `${action} failed`);
    } finally {
      setPendingId(null);
    }
  }

  function dismiss(id: string) {
    return act(id, "dismiss", (s) => s.filter((sig) => sig.id !== id));
  }

  function acknowledge(id: string) {
    return act(id, "acknowledge", (s) =>
      s.map((sig) =>
        sig.id === id ? { ...sig, acknowledgedAt: new Date().toISOString() } : sig,
      ),
    );
  }

  if (!signals.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
        <div className="font-medium text-slate-700">{t("pages.sphereSignals.empty")}</div>
        <p className="mt-1">{t("pages.dashFragments.signalsFire")}{" "}
          <Link href="/dashboard/sphere" className="text-brand-accent-text hover:underline">{t("pages.sphereSignals.openContact")}</Link>{" "}{t("pages.dashFragments.addSignalManually")}</p>
      </div>
    );
  }

  return (
    <>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <ul className="space-y-3">
        {signals.map((s) => (
          <li
            key={s.id}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start gap-4">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                style={{
                  background: avatarColorFor(s.contact.firstName + (s.contact.lastName ?? "")),
                }}
              >
                {(s.contact.firstName?.[0] ?? "") + (s.contact.lastName?.[0] ?? "")}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/dashboard/sphere/${s.contact.id}`}
                    className="truncate text-sm font-semibold text-slate-900 hover:underline"
                  >
                    {s.contact.firstName} {s.contact.lastName ?? ""}
                  </Link>
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                    {s.confidence}
                  </span>
                </div>
                <div className="mt-0.5 text-sm text-slate-700">{s.label}</div>
                {s.suggestedAction && (
                  <div className="mt-1 text-xs text-slate-500">{s.suggestedAction}</div>
                )}
                <div className="mt-1 flex items-center gap-3 text-[10px] uppercase tracking-wide text-slate-400">
                  <span>{t("pages.sphereProfile.detected", { date: new Date(s.detectedAt).toLocaleDateString(locale) })}</span>
                  {s.contact.phone && <span>· {s.contact.phone}</span>}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-stretch gap-2">
                {s.contact.phone && (
                  <a
                    href={`tel:${s.contact.phone.replace(/[^+\d]/g, "")}`}
                    className="rounded-lg bg-brand-accent px-3 py-2 text-center text-xs font-medium text-white"
                  >{t("pages.sphereSignals.call")}</a>
                )}
                {!s.acknowledgedAt && (
                  <button
                    type="button"
                    onClick={() => void acknowledge(s.id)}
                    disabled={pendingId === s.id}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    title={t("pages.sphereSignals.markSeen")}
                  >
                    {pendingId === s.id ? "…" : t("common:actions.acknowledge")}
                  </button>
                )}
                {s.acknowledgedAt && (
                  <span className="rounded-lg bg-slate-50 px-3 py-2 text-center text-xs text-slate-500">
                    ✓ Acknowledged
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void dismiss(s.id)}
                  disabled={pendingId === s.id}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  {pendingId === s.id ? t("common:status.dismissing") : t("common:actions.dismiss")}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function avatarColorFor(seed: string): string {
  const palette = ["#8F4A2E", "#5C4A3E", "#6B5D4E", "#7A5B42", "#4A3E33", "#6B4A3E"];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}
