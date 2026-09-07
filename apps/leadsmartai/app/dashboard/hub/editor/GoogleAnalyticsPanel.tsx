"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";
import type { GaBlock } from "@/lib/leads-gen/google-analytics";
import { SaveButton, Select, type SaveState } from "./ui";

/**
 * The Google block on the marketing page: the agent's own GA4 property,
 * read for them once they connect the Google account that owns it.
 *
 * Four states, each said in words: not connected (a button), connected
 * but no property chosen (a picker over the properties the account was
 * seen to own), connected and reading (the numbers), and connected but
 * Google stopped answering (the last numbers, and why).
 */

const CHANNEL_KEYS: Record<string, string> = {
  "Organic Search": "organicSearch",
  "Paid Search": "paidSearch",
  "Organic Social": "organicSocial",
  "Paid Social": "paidSocial",
  Direct: "direct",
  Referral: "referral",
  Email: "email",
  Display: "display",
  Unassigned: "unassigned",
  "Cross-network": "crossNetwork",
  "Organic Video": "organicVideo",
  "Paid Video": "paidVideo",
  "Organic Shopping": "organicShopping",
  "Paid Shopping": "paidShopping",
  SMS: "sms",
  Affiliates: "affiliates",
  Audio: "audio",
};

function n(v: number | null | undefined, locale: string): string {
  return v == null ? "—" : v.toLocaleString(locale);
}

export default function GoogleAnalyticsPanel({ ga, ga4TagConfigured, onChanged }: { ga: GaBlock; ga4TagConfigured: boolean; onChanged: () => void }) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const k = (s: string, vars?: Record<string, unknown>) => t(`pages.hubEditor.marketing.${s}`, vars);
  const params = useSearchParams();
  const flow = params.get("google");
  const flowReason = params.get("reason");

  const [choice, setChoice] = useState(ga.properties[0]?.id ?? "");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [busy, setBusy] = useState(false);

  const th = "px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500";
  const td = "px-3 py-2 text-sm text-slate-800 dark:text-slate-200 tabular-nums";
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) : null);
  const channelLabel = (c: string) => {
    const key = CHANNEL_KEYS[c];
    return key ? k(`ga.channelNames.${key}`) : c;
  };

  async function saveProperty() {
    if (!choice) return;
    setSaveState("saving");
    try {
      const r = await fetch("/api/dashboard/hub/google/property", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ propertyId: choice }) });
      const j = await r.json().catch(() => ({}));
      if (!j?.ok) throw new Error();
      setSaveState("saved");
      onChanged();
    } catch {
      setSaveState("error");
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await fetch("/api/dashboard/hub/google/disconnect", { method: "POST" });
    } finally {
      setBusy(false);
      onChanged();
    }
  }

  const flowLine =
    flow === "connected"
      ? k("ga.status.connected")
      : flow === "choose"
        ? k("ga.status.choose")
        : flow === "none"
          ? k("ga.none")
          : flow === "cancelled"
            ? k("ga.status.cancelled")
            : flow === "error"
              ? k("ga.status.error", { reason: flowReason === "not_configured" || flowReason === "start_failed" ? k(`ga.reason.${flowReason}`) : (flowReason ?? "") })
              : null;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{k("google")}</h3>
        {ga.connected ? (
          <button type="button" onClick={disconnect} disabled={busy} className="text-xs font-medium text-slate-500 hover:text-red-700 dark:text-slate-400 disabled:opacity-50">
            {k("ga.disconnect")}
          </button>
        ) : null}
      </div>

      {flowLine ? (
        <p role="status" className={`mb-2 rounded-lg px-3 py-2 text-xs ring-1 ring-inset ${flow === "connected" ? "bg-emerald-50 text-emerald-900 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-900" : "bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900"}`}>
          {flowLine}
        </p>
      ) : null}

      <p className="text-sm text-slate-700 dark:text-slate-300">{ga4TagConfigured ? k("ga4On") : k("ga4Off")}</p>
      {!ga4TagConfigured ? (
        <Link href="/dashboard/hub?section=settings" className="mt-1 inline-flex text-sm font-medium text-[#0072ce] hover:underline">
          {k("openSettings")}
        </Link>
      ) : null}

      {!ga.connected ? (
        <div className="mt-3">
          <p className="text-sm text-slate-600 dark:text-slate-400">{k("ga.connectHint")}</p>
          <a
            href="/api/dashboard/hub/google/start"
            className="mt-2 inline-flex min-h-10 items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
          >
            {k("ga.connect")}
          </a>
        </div>
      ) : ga.error === "expired" ? (
        <div className="mt-3">
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-inset ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900">{k("ga.expired")}</p>
          <a href="/api/dashboard/hub/google/start" className="mt-2 inline-flex text-sm font-medium text-[#0072ce] hover:underline">
            {k("ga.reconnect")}
          </a>
        </div>
      ) : !ga.property ? (
        <div className="mt-3 space-y-2">
          {ga.properties.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-400">{k("ga.none")}</p>
          ) : (
            <>
              <p className="text-sm text-slate-600 dark:text-slate-400">{k("ga.choose")}</p>
              <Select value={choice} onChange={setChoice} options={ga.properties.map((p) => ({ value: p.id, label: p.name }))} />
              <SaveButton state={saveState} onClick={saveProperty} disabled={!choice} />
            </>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {k("ga.property")}: <span className="font-medium text-slate-700 dark:text-slate-300">{ga.property.name}</span>
            {ga.refreshedAt ? ` · ${k("refreshedAt", { when: when(ga.refreshedAt) })}` : ""}
          </p>
          {ga.error === "read_failed" ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-inset ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900">{ga.report ? k("ga.readFailedStale") : k("ga.readFailed")}</p>
          ) : null}
          {ga.report ? (
            <>
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                <table className="w-full min-w-[28rem]">
                  <thead className="bg-slate-50 dark:bg-slate-800/60">
                    <tr>
                      <th className={th}>{k("ga.scope")}</th>
                      <th className={th}>{k("ga.sessions")}</th>
                      <th className={th}>{k("ga.users")}</th>
                      <th className={th}>{k("ga.pageViews")}</th>
                      <th className={th}>{k("ga.keyEvents")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    <tr>
                      <td className={`${td} font-medium`}>{k("ga.all")}</td>
                      <td className={td}>{n(ga.report.all.sessions, locale)}</td>
                      <td className={td}>{n(ga.report.all.users, locale)}</td>
                      <td className={td}>{n(ga.report.all.pageViews, locale)}</td>
                      <td className={td}>{n(ga.report.all.keyEvents, locale)}</td>
                    </tr>
                    <tr>
                      <td className={`${td} font-medium`}>
                        {k("ga.hubPages")}
                        {!ga.report.hub ? <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">{k("ga.hubNone")}</span> : null}
                      </td>
                      <td className={td}>{n(ga.report.hub?.sessions, locale)}</td>
                      <td className={td}>{n(ga.report.hub?.users, locale)}</td>
                      <td className={td}>{n(ga.report.hub?.pageViews, locale)}</td>
                      <td className={td}>{n(ga.report.hub?.keyEvents, locale)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {ga.report.channels.length ? (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{k("ga.channels")}</p>
                  <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                    <table className="w-full min-w-[24rem]">
                      <thead className="bg-slate-50 dark:bg-slate-800/60">
                        <tr>
                          <th className={th}>{k("ga.channel")}</th>
                          <th className={th}>{k("ga.sessions")}</th>
                          <th className={th}>{k("ga.users")}</th>
                          <th className={th}>{k("ga.keyEvents")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {ga.report.channels.map((c) => (
                          <tr key={c.channel}>
                            <td className={`${td} font-medium`}>{channelLabel(c.channel)}</td>
                            <td className={td}>{n(c.sessions, locale)}</td>
                            <td className={td}>{n(c.users, locale)}</td>
                            <td className={td}>{n(c.keyEvents, locale)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">{k("ga.empty")}</p>
              )}

              {ga.report.events.length ? (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{k("ga.events")}</p>
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                    {ga.report.events.map((e) => (
                      <li key={e.name} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
                        <code className="text-xs text-slate-700 dark:text-slate-300">{e.name}</code>
                        <span className="tabular-nums text-slate-800 dark:text-slate-200">{n(e.count, locale)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      )}

      <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{k("googleAds")}</p>
    </div>
  );
}
