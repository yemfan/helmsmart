"use client";

import { useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { saveBrand } from "@/app/dashboard/team/actions";
import type { TeamBrand } from "@/lib/teams/brand";
import { useUnsavedChanges } from "@/lib/forms/unsaved";

/**
 * The brokerage brand, set once by the owner and shown on every member's
 * public hub: name and logo in the header, license, website and disclosure
 * in the footer. Saving reports itself on the button; a field the server
 * refused is named.
 */
export function BrokerageBrandCard({ teamId, brand }: { teamId: string; brand: TeamBrand | null }) {
  const { t } = useTranslation("dashboard");
  const k = (s: string) => t(`pages.teamBrand.${s}`);
  const initial = { name: brand?.name ?? "", logoUrl: brand?.logoUrl ?? "", website: brand?.website ?? "", license: brand?.license ?? "", disclosure: brand?.disclosure ?? "" };
  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [badField, setBadField] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  useUnsavedChanges(dirty);

  function submit() {
    setState("saving");
    setBadField(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("teamId", teamId);
      for (const [key, value] of Object.entries(form)) fd.set(key, value);
      const r = await saveBrand(fd);
      if (r.ok) {
        setSaved(form);
        setState("saved");
      } else {
        setBadField(r.field ?? null);
        setState("error");
      }
    });
  }

  const input = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100";
  const field = (key: keyof typeof form, label: string, hint: string, rows?: number) => (
    <label className="block text-sm">
      <span className="font-medium text-slate-800 dark:text-slate-200">{label}</span>
      {rows ? (
        <textarea value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} rows={rows} className={input} />
      ) : (
        <input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className={input} />
      )}
      <span className={`mt-0.5 block text-xs ${badField === key ? "text-red-700 dark:text-red-400" : "text-slate-500 dark:text-slate-400"}`}>{badField === key ? k("invalid") : hint}</span>
    </label>
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 ring-1 ring-slate-900/[0.04] shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{k("title")}</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{k("subtitle")}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {field("name", k("name"), k("nameHint"))}
        {field("license", k("license"), k("licenseHint"))}
        {field("logoUrl", k("logo"), k("logoHint"))}
        {field("website", k("website"), k("websiteHint"))}
      </div>
      <div className="mt-4">{field("disclosure", k("disclosure"), k("disclosureHint"), 3)}</div>
      {form.logoUrl && badField !== "logoUrl" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={form.logoUrl} alt="" className="mt-3 h-10 w-auto max-w-[12rem] object-contain" />
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending || !dirty}
          className={`inline-flex min-h-10 items-center rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${state === "error" ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"}`}
        >
          {state === "saving" ? t("pages.hubEditor.saving") : state === "saved" && !dirty ? t("pages.hubEditor.saved") : state === "error" ? t("pages.hubEditor.saveFailed") : t("pages.hubEditor.save")}
        </button>
        {dirty && state !== "saving" ? <span className="text-sm font-medium text-amber-700 dark:text-amber-400">{t("unsaved.note")}</span> : null}
      </div>
    </section>
  );
}
