"use client";

import { useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { saveMyLicense } from "@/app/dashboard/team/actions";
import { intlLocale } from "@/lib/i18n/locale";
import { hasPublicRecord, licenseExample, licenseLabel, licenseLookupUrl, licenseRegulator, LICENSE_STATES, US_STATES, type AgentLicense } from "@/lib/teams/license";

/**
 * The agent's license, required by the brokerage at onboarding: state,
 * number, and what the regulator's public record says about it. The Save
 * button carries its own outcome; the lines under it show the record
 * (who it belongs to, whether it is current, when it expires, which broker
 * it hangs with) or, where no public record exists, the regulator's own
 * lookup for a person to check.
 */

const STATUS_TONE: Record<AgentLicense["status"], string> = {
  verified: "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900",
  format_ok: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
  unavailable: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
  not_found: "bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900",
  inactive: "bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900",
  mismatch: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900",
};

/** SALESPERSON → Salesperson; anything else title-cased the same way. */
function typeLabel(raw: string | null): string {
  if (!raw) return "";
  return raw.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function LicenseStatusChip({ license }: { license: AgentLicense }) {
  const { t } = useTranslation("dashboard");
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs ring-1 ${STATUS_TONE[license.status]}`}>{t(`pages.teamLicense.status.${license.status}`)}</span>;
}

/** What the public record says, one line, for the form and the board. */
export function LicenseRecordLine({ license }: { license: AgentLicense }) {
  const { t, i18n } = useTranslation("dashboard");
  const k = (s: string, vars?: Record<string, unknown>) => t(`pages.teamLicense.${s}`, vars);
  const r = license.record;
  if (!r) return null;
  const date = r.expiresOn ? new Date(`${r.expiresOn}T00:00:00Z`).toLocaleDateString(intlLocale(i18n.language), { dateStyle: "medium", timeZone: "UTC" }) : null;
  return (
    <span className="block text-xs text-slate-600 dark:text-slate-400">
      {k("record.line", { regulator: licenseRegulator(license.state) ?? license.state, name: r.holderName ?? "—", type: typeLabel(r.licenseType), status: typeLabel(r.statusRaw) })}
      {date ? ` · ${k("record.expires", { date })}` : ""}
      {r.responsibleBroker?.name ? ` · ${k("record.broker", { name: r.responsibleBroker.name })}` : ""}
      {r.discipline ? <span className="ml-1 text-rose-700 dark:text-rose-400">{k("record.discipline")}</span> : null}
    </span>
  );
}

export function LicenseForm({ initial, required, continueHref }: { initial: AgentLicense | null; required: boolean; continueHref?: string }) {
  const { t } = useTranslation("dashboard");
  const k = (s: string, vars?: Record<string, unknown>) => t(`pages.teamLicense.${s}`, vars);
  const [state, setState] = useState(initial?.state ?? "CA");
  const [number, setNumber] = useState(initial?.number ?? "");
  const [license, setLicense] = useState<AgentLicense | null>(initial);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100";
  const rule = LICENSE_STATES[state];
  const lookup = licenseLookupUrl(license?.state ?? state);
  const dirty = license ? license.state !== state || license.number !== number.trim().toUpperCase() : number.trim().length > 0;

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const fd = new FormData();
          fd.set("state", state);
          fd.set("number", number);
          const r = await saveMyLicense(fd);
          if (r.ok) {
            setLicense(r.license);
            setNumber(r.license.number);
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
          } else setError(k(`error.${r.reason}`));
        });
      }}
    >
      {/* Sized to what goes in them: a two-letter state and a license number
          of a dozen characters at most. The hint sits under both, full width,
          so it does not wrap inside the narrow field. */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="block w-28 text-sm">
          <span className="font-medium text-slate-800 dark:text-slate-200">{k("stateLabel")}</span>
          <select className={input} value={state} onChange={(e) => setState(e.target.value)} required>
            {US_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="block w-64 max-w-full text-sm">
          <span className="font-medium text-slate-800 dark:text-slate-200">{k("numberLabel", { label: rule ? rule.regulator : k("genericRegulator") })}</span>
          <input
            className={`${input} font-mono tracking-wide`}
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder={licenseExample(state) ?? ""}
            required={required}
            autoComplete="off"
            maxLength={20}
            inputMode={state === "CA" ? "numeric" : undefined}
          />
        </label>
      </div>
      <p className={`-mt-1 text-xs ${error ? "text-red-700 dark:text-red-400" : "text-slate-500 dark:text-slate-400"}`} role={error ? "alert" : undefined}>
        {error ?? (hasPublicRecord(state) ? k("numberHintRecord", { label: licenseLabel(state), regulator: rule?.regulator ?? state }) : k("numberHint", { label: licenseLabel(state) }))}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || (!dirty && !saved)} className="inline-flex min-h-9 items-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
          {pending ? (hasPublicRecord(state) ? k("lookingUp") : k("saving")) : saved ? k("saved") : k("save")}
        </button>
        {license ? (
          <span className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
            <LicenseStatusChip license={license} />
            <span>{k(`statusHint.${license.status}`, { via: license.verifiedBy === "manager" ? k("byManager") : k("byRecord", { regulator: licenseRegulator(license.state) ?? license.state }) })}</span>
            {lookup && license.status !== "verified" ? (
              <a href={lookup} target="_blank" rel="noreferrer" className="text-blue-700 underline-offset-2 hover:underline dark:text-blue-400">
                {k("checkOnRegulator", { regulator: licenseRegulator(license.state) ?? license.state })}
              </a>
            ) : null}
          </span>
        ) : null}
        {license && continueHref ? (
          <a href={continueHref} className="ml-auto inline-flex min-h-9 items-center rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800">
            {k("continue")}
          </a>
        ) : null}
      </div>
      {license ? <LicenseRecordLine license={license} /> : null}
      {!hasPublicRecord(state) ? <p className="text-xs text-slate-500 dark:text-slate-400">{k("lookupNone")}</p> : null}
    </form>
  );
}
