"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Ad Composer — pick a template + theme + format, edit every field, watch a live
 * preview, then save to the pool or schedule. Brand fields (name, brokerage,
 * logo) pre-fill from /api/dashboard/branding; the photo picker reads the ad
 * photo pool. Preview is the public /api/social/ad/preview route rendered into
 * an <img>; save/schedule POSTs to /api/social/ad.
 */

type Template = "bold" | "photo" | "stat" | "spotlight" | "feature" | "hook";
type Theme = "navy" | "midnight" | "azure" | "light";
type Format = "square" | "portrait" | "landscape";

// Labels are translation keys: this list is module scope and cannot hold a hook.
const TEMPLATES: { key: Template; labelKey: string; hintKey: string }[] = [
  { key: "feature", labelKey: "pages.adComposer.tpl.feature", hintKey: "pages.adComposer.tpl.featureHint" },
  { key: "hook", labelKey: "pages.adComposer.tpl.hook", hintKey: "pages.adComposer.tpl.hookHint" },
  { key: "spotlight", labelKey: "pages.adComposer.tpl.spotlight", hintKey: "pages.adComposer.tpl.spotlightHint" },
  { key: "photo", labelKey: "pages.adComposer.tpl.photo", hintKey: "pages.adComposer.tpl.photoHint" },
  { key: "bold", labelKey: "pages.adComposer.tpl.bold", hintKey: "pages.adComposer.tpl.boldHint" },
  { key: "stat", labelKey: "pages.adComposer.tpl.stat", hintKey: "pages.adComposer.tpl.statHint" },
];
const THEMES: { key: Theme; labelKey: string; swatch: string }[] = [
  { key: "navy", labelKey: "pages.adComposer.themeName.navy", swatch: "#0B1F44" },
  { key: "midnight", labelKey: "pages.adComposer.themeName.midnight", swatch: "#05070d" },
  { key: "azure", labelKey: "pages.adComposer.themeName.azure", swatch: "#0a84e0" },
  { key: "light", labelKey: "pages.adComposer.themeName.light", swatch: "#eef2f7" },
];
const FORMATS: { key: Format; labelKey: string }[] = [
  { key: "square", labelKey: "pages.adComposer.fmt.square" },
  { key: "portrait", labelKey: "pages.adComposer.fmt.portrait" },
  { key: "landscape", labelKey: "pages.adComposer.fmt.landscape" },
];

type Fields = {
  template: Template;
  theme: Theme;
  format: Format;
  headline: string;
  headlineAccent: string;
  badge: string;
  subhead: string;
  ctaText: string;
  statValue: string;
  statLabel: string;
  statContext: string;
  photoUrl: string;
  agentName: string;
  brokerage: string;
  caption: string;
  hashtags: string;
};

const EMPTY: Fields = {
  template: "feature",
  theme: "navy",
  format: "portrait",
  headline: "Get your",
  headlineAccent: "life back.",
  badge: "REALTORS",
  subhead: "CloseBoss AI handles the busywork so you can focus on what matters and close more deals.",
  ctaText: "Book a demo",
  statValue: "",
  statLabel: "",
  statContext: "",
  photoUrl: "",
  agentName: "",
  brokerage: "",
  caption: "",
  hashtags: "realestate, realtor, aiforrealestate, closebossai",
};

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function AdComposerClient({ canCustomize }: { canCustomize: boolean }) {
  const { t: tr } = useTranslation("dashboard");
  const [f, setF] = useState<Fields>(EMPTY);
  const [photos, setPhotos] = useState<{ id: string; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const logoRef = useRef<string>("");

  const set = useCallback(<K extends keyof Fields>(k: K, v: Fields[K]) => setF((p) => ({ ...p, [k]: v })), []);

  // Pre-fill brand defaults + load the photo pool.
  useEffect(() => {
    if (!canCustomize) return;
    (async () => {
      try {
        const b = await fetch("/api/dashboard/branding").then((r) => r.json());
        if (b?.ok) {
          logoRef.current = b.branding?.logoUrl || "";
          setF((p) => ({
            ...p,
            agentName: p.agentName || b.branding?.brandName || b.profile?.fullName || "",
            brokerage: p.brokerage || b.profile?.brokerage || "",
          }));
        }
      } catch {
        /* branding is optional */
      }
      try {
        const ph = await fetch("/api/social/ad/photos").then((r) => r.json());
        if (ph?.ok && Array.isArray(ph.photos)) setPhotos(ph.photos.map((x: { id: string; url: string }) => ({ id: x.id, url: x.url })));
      } catch {
        /* photo pool optional */
      }
    })();
  }, [canCustomize]);

  const debounced = useDebounced(f, 400);
  const previewUrl = useMemo(() => {
    const q = new URLSearchParams();
    q.set("template", debounced.template);
    q.set("theme", debounced.theme);
    q.set("format", debounced.format);
    if (debounced.headline) q.set("headline", debounced.headline);
    if (debounced.headlineAccent) q.set("headlineAccent", debounced.headlineAccent);
    if (debounced.badge) q.set("badge", debounced.badge);
    if (debounced.subhead) q.set("subhead", debounced.subhead);
    if (debounced.ctaText) q.set("cta", debounced.ctaText);
    if (debounced.statValue) q.set("statValue", debounced.statValue);
    if (debounced.statLabel) q.set("statLabel", debounced.statLabel);
    if (debounced.statContext) q.set("statContext", debounced.statContext);
    if (debounced.photoUrl) q.set("photoUrl", debounced.photoUrl);
    if (debounced.agentName) q.set("agentName", debounced.agentName);
    if (debounced.brokerage) q.set("brokerage", debounced.brokerage);
    if (logoRef.current) q.set("logoUrl", logoRef.current);
    return `/api/social/ad/preview?${q.toString()}`;
  }, [debounced]);

  const save = useCallback(
    async (opts: { schedule: boolean; publishNow?: boolean }) => {
      setBusy(true);
      setMsg(null);
      try {
        const res = await fetch("/api/social/ad", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...f,
            hashtags: f.hashtags.split(",").map((h) => h.trim()).filter(Boolean),
            schedule: opts.schedule,
            publishNow: opts.publishNow ?? false,
          }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.ok) throw new Error(j.error || "Save failed");
        setMsg({
          kind: "ok",
          text: opts.schedule
            ? opts.publishNow
              ? `Scheduled to ${j.scheduled} account${j.scheduled === 1 ? "" : "s"} — publishing shortly.`
              : `Queued to ${j.scheduled} account${j.scheduled === 1 ? "" : "s"} for your approval.`
            : "Saved to your ad pool.",
        });
      } catch (e) {
        setMsg({ kind: "err", text: e instanceof Error ? e.message : "Save failed" });
      } finally {
        setBusy(false);
      }
    },
    [f],
  );

  if (!canCustomize) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{tr("pages.adComposer.signatureOnly")}</div>
    );
  }

  const isStat = f.template === "stat";
  const usesPhoto = f.template === "photo" || f.template === "spotlight" || f.template === "feature";
  const usesAccent = f.template === "spotlight" || f.template === "feature" || f.template === "hook";
  const usesBadge = f.template === "spotlight" || f.template === "hook";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_minmax(320px,420px)]">
      {/* ---- editor ---- */}
      <div className="space-y-5">
        <Section title={tr("pages.adComposer.template")}>
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => set("template", t.key)}
                className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                  f.template === t.key ? "border-[#0072ce] bg-blue-50" : "border-slate-200 dark:border-slate-700 hover:border-slate-300"
                }`}
              >
                <div className="font-semibold text-slate-900 dark:text-slate-100">{tr(t.labelKey)}</div>
                <div className="text-xs text-slate-500">{tr(t.hintKey)}</div>
              </button>
            ))}
          </div>
        </Section>

        <div className="grid gap-5 sm:grid-cols-2">
          <Section title={tr("pages.adComposer.theme")}>
            <div className="flex flex-wrap gap-2">
              {THEMES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => set("theme", t.key)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition ${
                    f.theme === t.key ? "border-[#0072ce] bg-blue-50" : "border-slate-200 dark:border-slate-700 hover:border-slate-300"
                  }`}
                >
                  <span className="h-4 w-4 rounded-full border border-black/10" style={{ background: t.swatch }} />
                  {tr(t.labelKey)}
                </button>
              ))}
            </div>
          </Section>
          <Section title={tr("pages.adComposer.format")}>
            <div className="flex flex-wrap gap-2">
              {FORMATS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => set("format", t.key)}
                  className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                    f.format === t.key ? "border-[#0072ce] bg-blue-50" : "border-slate-200 dark:border-slate-700 hover:border-slate-300"
                  }`}
                >
                  {tr(t.labelKey)}
                </button>
              ))}
            </div>
          </Section>
        </div>

        <Section title={tr("pages.adComposer.content")}>
          <div className="space-y-3">
            {isStat ? (
              <>
                <Field label={tr("pages.adComposer.statValue")} value={f.statValue} onChange={(v) => set("statValue", v)} placeholder="6.9%" />
                <Field label={tr("pages.adComposer.statLabel")} value={f.statLabel} onChange={(v) => set("statLabel", v)} placeholder={tr("pages.adComposer.statLabelPlaceholder")} />
                <Field label={tr("pages.adComposer.context")} value={f.statContext} onChange={(v) => set("statContext", v)} />
              </>
            ) : (
              <>
                <Field label={usesAccent ? tr("pages.adComposer.title1") : tr("pages.adComposer.headline")} value={f.headline} onChange={(v) => set("headline", v)} />
                {usesAccent && (
                  <Field label={tr("pages.adComposer.title2")} value={f.headlineAccent} onChange={(v) => set("headlineAccent", v)} />
                )}
                {usesBadge && <Field label={tr("pages.adComposer.badge")} value={f.badge} onChange={(v) => set("badge", v)} placeholder={tr("pages.adComposer.badgePlaceholder")} />}
                <Field label={tr("pages.adComposer.subtext")} value={f.subhead} onChange={(v) => set("subhead", v)} textarea />
                <Field label={tr("pages.adComposer.cta")} value={f.ctaText} onChange={(v) => set("ctaText", v)} placeholder={tr("pages.adComposer.ctaPlaceholder")} />
              </>
            )}
          </div>
        </Section>

        {usesPhoto && (
          <Section title={tr("pages.adComposer.photoField")}>
            {photos.length === 0 ? (
              <p className="text-sm text-slate-500">
                {tr("pages.adComposer.noPhotosBefore")} <span className="font-medium">{tr("pages.adComposer.adPhotos")}</span>{tr("pages.adComposer.noPhotosAfter")}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => set("photoUrl", "")}
                  className={`flex h-16 w-16 items-center justify-center rounded-lg border text-xs ${
                    !f.photoUrl ? "border-[#0072ce] bg-blue-50" : "border-slate-200 dark:border-slate-700"
                  }`}
                >{tr("pages.adComposer.none")}</button>
                {photos.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => set("photoUrl", p.url)}
                    className={`h-16 w-16 overflow-hidden rounded-lg border ${
                      f.photoUrl === p.url ? "border-[#0072ce] ring-2 ring-[#0072ce]" : "border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </Section>
        )}

        <Section title={tr("pages.adComposer.brand")}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={tr("pages.adComposer.brandName")} value={f.agentName} onChange={(v) => set("agentName", v)} />
            <Field label={tr("pages.adComposer.brokerage")} value={f.brokerage} onChange={(v) => set("brokerage", v)} />
          </div>
          <p className="mt-1.5 text-xs text-slate-500">{tr("pages.adComposer.logoNote")}</p>
        </Section>

        <Section title={tr("pages.adComposer.captionSeo")}>
          <div className="space-y-3">
            <Field label={tr("pages.adComposer.caption")} value={f.caption} onChange={(v) => set("caption", v)} textarea placeholder={tr("pages.adComposer.captionHint")} />
            <Field label={tr("pages.adComposer.hashtags")} value={f.hashtags} onChange={(v) => set("hashtags", v)} />
          </div>
        </Section>

        {msg && (
          <div className={`rounded-lg px-4 py-2.5 text-sm ${msg.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
            {msg.text}
          </div>
        )}

        <div className="flex flex-wrap gap-3 border-t border-slate-100 dark:border-slate-700 pt-4">
          <button type="button" disabled={busy} onClick={() => save({ schedule: false })} className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">{tr("pages.adComposer.saveToPool")}</button>
          <button type="button" disabled={busy} onClick={() => save({ schedule: true, publishNow: false })} className="rounded-lg border border-[#0072ce] px-4 py-2 text-sm font-semibold text-[#0072ce] hover:bg-blue-50 disabled:opacity-50">{tr("pages.adComposer.queueForApproval")}</button>
          <button type="button" disabled={busy} onClick={() => save({ schedule: true, publishNow: true })} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{tr("pages.adComposer.publishNow")}</button>
          <Link href="/dashboard/ai-marketing-assistant" className="ml-auto self-center text-sm text-slate-500 hover:text-slate-700">
            ← Back
          </Link>
        </div>
      </div>

      {/* ---- live preview ---- */}
      <div className="lg:sticky lg:top-4 lg:self-start">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">{tr("pages.adComposer.livePreview")}</div>
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt={tr("pages.adComposer.adPreview")} className="mx-auto w-full max-w-[380px] rounded-lg" />
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  textarea?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">{label}</span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm focus:border-[#0072ce] focus:outline-none focus:ring-1 focus:ring-[#0072ce]"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm focus:border-[#0072ce] focus:outline-none focus:ring-1 focus:ring-[#0072ce]"
        />
      )}
    </label>
  );
}
