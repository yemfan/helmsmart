"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  saveGuide,
  publishGuide,
  setGuideStatus,
  saveBrandName,
  type SaveStepInput,
} from "@/lib/actions/dashboard";
import type { GuideEdit, GuideAnalytics } from "@/lib/dashboard-data";
import type { GuideMeta, LocalizedText, MetaFields, Part } from "@/lib/types";
import {
  LOCALES,
  LOCALE_LABELS,
  LOCALE_NAMES,
  LOCALE_SCRIPT,
  pick,
  type Locale,
} from "@/lib/locales";
import styles from "@/app/app/dashboard.module.css";

interface Props {
  guideId: string;
  data: GuideEdit;
  analytics: GuideAnalytics;
  brandName: string;
  appUrl: string;
}

const emptyStep = (): SaveStepInput => ({ position: 0, title: {}, body: {}, tip: {}, image_url: null });

function scriptFontFamily(locale: Locale): string {
  const s = LOCALE_SCRIPT[locale];
  if (s === "sc") return "var(--font-zh-body)";
  if (s === "jp") return "var(--font-jp-body)";
  return "var(--font-body)";
}

export function GuideEditor({ guideId, data, analytics, brandName, appUrl }: Props) {
  const router = useRouter();

  const [languages, setLanguages] = useState<Locale[]>(
    data.guide.languages?.length ? data.guide.languages : ["en"]
  );
  const [activeLang, setActiveLang] = useState<Locale>(
    data.guide.languages?.[0] ?? "en"
  );

  const [name, setName] = useState<LocalizedText>(data.product.name ?? {});
  const [modelNo, setModelNo] = useState(data.product.model_no ?? "");
  const [brand, setBrand] = useState(brandName);

  const [meta, setMeta] = useState<GuideMeta>(data.guide.meta ?? {});
  const [parts, setParts] = useState<Part[]>(data.guide.parts ?? []);
  const [steps, setSteps] = useState<SaveStepInput[]>(
    data.steps.map((s) => ({
      position: s.position,
      title: s.title ?? {},
      body: s.body ?? {},
      tip: s.tip ?? {},
      image_url: s.image_url,
    }))
  );

  const [slug, setSlug] = useState(data.guide.slug);
  const [status, setStatus] = useState(data.guide.status);
  const [busy, setBusy] = useState<"" | "saving" | "publishing">("");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const uploadFor = useRef<number | null>(null);
  const stepFileInput = useRef<HTMLInputElement>(null);

  const hostedUrl = slug ? `${appUrl}/g/${slug}` : "";
  const L = activeLang;
  const langFont = scriptFontFamily(L);

  /* ---------- localized field helpers ---------- */
  const setNameL = (v: string) => setName((m) => ({ ...m, [L]: v }));
  const setMetaL = (field: keyof MetaFields, v: string) =>
    setMeta((m) => ({ ...m, [L]: { ...(m[L] ?? {}), [field]: v } }));

  function patchStepL(i: number, key: "title" | "body" | "tip", v: string) {
    setSteps((prev) => prev.map((s, j) => (j === i ? { ...s, [key]: { ...s[key], [L]: v } } : s)));
  }
  function patchStep(i: number, patch: Partial<SaveStepInput>) {
    setSteps((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }
  function moveStep(i: number, dir: -1 | 1) {
    setSteps((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  const removeStep = (i: number) => setSteps((prev) => prev.filter((_, j) => j !== i));
  const addStep = () => setSteps((prev) => [...prev, emptyStep()]);

  function patchPart(i: number, patch: Partial<Part>) {
    setParts((prev) => prev.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  }
  function patchPartNameL(i: number, v: string) {
    setParts((prev) => prev.map((p, j) => (j === i ? { ...p, name: { ...p.name, [L]: v } } : p)));
  }
  function addPart() {
    const nextCode = String.fromCharCode(65 + parts.length);
    setParts((prev) => [...prev, { code: nextCode, name: {}, qty: 1 }]);
  }
  const removePart = (i: number) => setParts((prev) => prev.filter((_, j) => j !== i));

  function toggleLanguage(l: Locale) {
    setLanguages((prev) => {
      const on = prev.includes(l);
      if (on && prev.length === 1) return prev; // keep at least one
      const next = on ? prev.filter((x) => x !== l) : [...prev, l];
      // Keep display order consistent with LOCALES.
      const ordered = LOCALES.filter((x) => next.includes(x));
      if (!ordered.includes(activeLang)) setActiveLang(ordered[0]);
      return ordered;
    });
  }

  /* ---------- image upload ---------- */
  async function onPickStepImage(i: number) {
    uploadFor.current = i;
    stepFileInput.current?.click();
  }
  async function onStepFileChosen(file: File) {
    const i = uploadFor.current;
    if (i == null) return;
    const supabase = createClient();
    if (!supabase) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user.id}/${guideId}/step-${i}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("guide-images")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) {
      setMsg({ text: "Image upload failed.", ok: false });
      return;
    }
    const { data: pub } = supabase.storage.from("guide-images").getPublicUrl(path);
    patchStep(i, { image_url: pub.publicUrl });
  }

  function collect() {
    return {
      productId: data.product.id,
      languages,
      name,
      model_no: modelNo,
      meta,
      parts,
      steps,
    };
  }

  async function onSave(): Promise<boolean> {
    setBusy("saving");
    setMsg(null);
    if (brand !== brandName) await saveBrandName(brand);
    const res = await saveGuide(guideId, collect());
    setBusy("");
    setMsg(res.ok ? { text: "Saved.", ok: true } : { text: res.message ?? "Save failed.", ok: false });
    return res.ok;
  }

  async function onPublish() {
    const saved = await onSave();
    if (!saved) return;
    setBusy("publishing");
    const res = await publishGuide(guideId);
    setBusy("");
    if (res.ok && res.slug) {
      setSlug(res.slug);
      setStatus("published");
      setMsg({ text: "Published! Your guide is live.", ok: true });
    } else {
      setMsg({ text: res.message ?? "Publish failed.", ok: false });
    }
  }

  async function onStatus(next: "draft" | "archived") {
    const res = await setGuideStatus(guideId, next);
    if (res.ok) {
      setStatus(next);
      setMsg({ text: next === "archived" ? "Archived." : "Moved to draft.", ok: true });
    }
  }

  /* completeness hint: does the active language have text everywhere it should? */
  const missingForActive =
    !pick(name, L) ||
    parts.some((p) => !p.name[L]) ||
    steps.some((s) => !s.title[L] || !s.body[L]);

  const localizedInputStyle = { fontFamily: langFont } as React.CSSProperties;

  return (
    <main className={styles.container}>
      <input
        ref={stepFileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          const fl = e.target.files?.[0];
          if (fl) onStepFileChosen(fl);
          e.target.value = "";
        }}
      />

      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.h1}>Edit guide</h1>
          <p className={styles.sub}>
            Status: <strong>{status}</strong>
            {slug ? ` · /g/${slug}` : " · not published yet"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className={styles.btn} onClick={onSave} disabled={busy !== ""}>
            {busy === "saving" ? "Saving…" : "Save draft"}
          </button>
          <button className={`${styles.btn} ${styles.btnAccent}`} onClick={onPublish} disabled={busy !== ""}>
            {busy === "publishing" ? "Publishing…" : status === "published" ? "Update live guide" : "Publish"}
          </button>
        </div>
      </div>

      {msg && (
        <div className={styles.notice} style={{ background: msg.ok ? "var(--color-green-soft)" : "#fff7f3", borderColor: msg.ok ? "#bfe0cd" : "#f6c9b6", color: msg.ok ? "var(--color-green)" : "#9a3d1a" }} role="status">
          {msg.text}
        </div>
      )}

      {/* Published card: link + QR + analytics */}
      {status === "published" && slug && (
        <div className={styles.panel}>
          <div className={styles.panelTitle}>Live guide</div>
          <div className={styles.qrBox}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.qrImg} src={`/g/${slug}/qr`} alt="QR code for this guide" />
            <div style={{ flex: 1, minWidth: 220 }}>
              <div className={styles.linkRow} style={{ marginBottom: 12 }}>
                <span className={styles.code}>{hostedUrl}</span>
                <a className={styles.btn} href={hostedUrl} target="_blank" rel="noreferrer">Open</a>
              </div>
              <div className={styles.linkRow}>
                <a className={styles.btn} href={`/g/${slug}/qr?download=1`} download>Download QR (PNG)</a>
                <a className={styles.btn} href={`/g/${slug}/qr?f=svg&download=1`} download>QR (SVG)</a>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 22 }}>
            <div className={styles.panelTitle} style={{ fontSize: 15 }}>Analytics</div>
            <div className={styles.statRow}>
              <div className={styles.stat}><span className={styles.statNum}>{analytics.scans}</span><span className={styles.statLabel}>Total scans</span></div>
              <div className={styles.stat}><span className={styles.statNum}>{analytics.finished}</span><span className={styles.statLabel}>Completed</span></div>
              <div className={styles.stat}><span className={styles.statNum}>{analytics.completionRate}%</span><span className={styles.statLabel}>Completion rate</span></div>
            </div>
            {analytics.perStepViews.length > 0 &&
              (() => {
                const max = Math.max(...analytics.perStepViews.map((s) => s.views), 1);
                return (
                  <div>
                    {analytics.perStepViews.map((s) => (
                      <div key={s.position} className={styles.barRow}>
                        <span className={styles.barLabel}>Step {s.position}</span>
                        <span className={styles.barTrack}><span className={styles.barFill} style={{ width: `${(s.views / max) * 100}%` }} /></span>
                        <span>{s.views}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
          </div>

          {status === "published" && (
            <div style={{ marginTop: 18 }}>
              <button className={styles.btn} onClick={() => onStatus("archived")}>Unpublish (archive)</button>
            </div>
          )}
        </div>
      )}

      {status === "archived" && (
        <div className={styles.panel}>
          <div className={styles.panelTitle}>Archived</div>
          <p className={styles.sub} style={{ marginBottom: 12 }}>This guide is not publicly visible. Republish to bring it back at the same link.</p>
          <button className={styles.btn} onClick={() => onStatus("draft")}>Move to draft</button>
        </div>
      )}

      {/* Languages this guide offers */}
      <div className={styles.panel}>
        <div className={styles.panelTitle}>Languages</div>
        <p className={styles.sub} style={{ marginBottom: 12 }}>
          Buyers can switch between the languages you enable here.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {LOCALES.map((l) => {
            const on = languages.includes(l);
            return (
              <button
                key={l}
                onClick={() => toggleLanguage(l)}
                className={styles.iconBtn}
                aria-pressed={on}
                style={{
                  fontFamily: scriptFontFamily(l),
                  background: on ? "var(--color-green-soft)" : "var(--color-card)",
                  borderColor: on ? "var(--color-green)" : "var(--color-line)",
                  color: on ? "var(--color-green)" : "var(--color-ink-soft)",
                  fontWeight: on ? 600 : 500,
                }}
              >
                {on ? "✓ " : ""}
                {LOCALE_NAMES[l]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Language tab bar — which language you're currently editing */}
      <div style={{ position: "sticky", top: 0, zIndex: 5, background: "var(--color-paper)", padding: "8px 0", marginBottom: 4 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span className={styles.langBadge} style={{ marginRight: 4 }}>EDITING</span>
          {languages.map((l) => (
            <button
              key={l}
              onClick={() => setActiveLang(l)}
              className={styles.iconBtn}
              aria-pressed={l === activeLang}
              style={{
                fontFamily: scriptFontFamily(l),
                background: l === activeLang ? "var(--color-ink)" : "var(--color-card)",
                color: l === activeLang ? "#fff" : "var(--color-ink)",
                borderColor: l === activeLang ? "var(--color-ink)" : "var(--color-line)",
              }}
            >
              {LOCALE_LABELS[l]}
            </button>
          ))}
        </div>
        {missingForActive && (
          <p style={{ fontSize: 12.5, color: "var(--color-accent)", marginTop: 8 }}>
            {LOCALE_NAMES[activeLang]} is missing some text — fill the empty fields below.
          </p>
        )}
      </div>

      {/* Product + brand */}
      <div className={styles.panel}>
        <div className={styles.panelTitle}>Product &amp; brand</div>
        <div className={styles.field}>
          <label className={styles.label}>Brand name (shown on the guide header)</label>
          <input className={styles.input} value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="NORDHOLM" />
        </div>
        <div className={styles.field}>
          <span className={styles.langBadge}>PRODUCT NAME · {LOCALE_LABELS[L]}</span>
          <input className={styles.input} style={localizedInputStyle} value={name[L] ?? ""} onChange={(e) => setNameL(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Model number (same for all languages)</label>
          <input className={styles.input} value={modelNo} onChange={(e) => setModelNo(e.target.value)} />
        </div>
      </div>

      {/* Meta */}
      <div className={styles.panel}>
        <div className={styles.panelTitle}>Overview (cover card) · {LOCALE_LABELS[L]}</div>
        {(["time_estimate", "people", "tools"] as const).map((k) => (
          <div className={styles.field} key={k}>
            <span className={styles.langBadge}>{k === "time_estimate" ? "TIME" : k === "people" ? "PEOPLE" : "TOOLS"}</span>
            <input
              className={styles.input}
              style={localizedInputStyle}
              value={meta[L]?.[k] ?? ""}
              onChange={(e) => setMetaL(k, e.target.value)}
            />
          </div>
        ))}
      </div>

      {/* Parts */}
      <div className={styles.panel}>
        <div className={styles.panelTitle}>Parts checklist</div>
        {parts.map((p, i) => (
          <div key={i} className={styles.stepEditor}>
            <div className={styles.stepEditorHead}>
              <input className={styles.input} style={{ width: 60 }} value={p.code} onChange={(e) => patchPart(i, { code: e.target.value })} aria-label="Part code" />
              <input className={styles.input} style={{ width: 80 }} type="number" min={0} value={p.qty} onChange={(e) => patchPart(i, { qty: Number(e.target.value) })} aria-label="Quantity" />
              <button className={styles.iconBtn} onClick={() => removePart(i)} aria-label="Remove part">✕</button>
            </div>
            <span className={styles.langBadge}>NAME · {LOCALE_LABELS[L]}</span>
            <input className={styles.input} style={localizedInputStyle} value={p.name[L] ?? ""} onChange={(e) => patchPartNameL(i, e.target.value)} />
          </div>
        ))}
        <button className={styles.btn} onClick={addPart}>+ Add part</button>
      </div>

      {/* Steps */}
      <div className={styles.panel}>
        <div className={styles.panelTitle}>Steps · editing {LOCALE_LABELS[L]}</div>
        {steps.map((s, i) => (
          <div key={i} className={styles.stepEditor}>
            <div className={styles.stepEditorHead}>
              <span className={styles.stepNo}>{String(i + 1).padStart(2, "0")}</span>
              <div style={{ display: "flex", gap: 6 }}>
                <button className={styles.iconBtn} onClick={() => moveStep(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                <button className={styles.iconBtn} onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} aria-label="Move down">↓</button>
                <button className={styles.iconBtn} onClick={() => removeStep(i)} aria-label="Remove step">✕</button>
              </div>
            </div>

            <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 12, flexWrap: "wrap" }}>
              <div className={styles.thumb} style={{ width: 96, height: 96, flexShrink: 0 }}>
                {s.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.image_url} alt={`Step ${i + 1}`} />
                ) : (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: 11, color: "var(--color-ink-soft)" }}>No image</div>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <button className={styles.iconBtn} onClick={() => onPickStepImage(i)}>{s.image_url ? "Change image" : "Add image"}</button>
                {s.image_url && <button className={styles.iconBtn} onClick={() => patchStep(i, { image_url: null })}>Clear image</button>}
                <span style={{ fontSize: 11, color: "var(--color-ink-soft)" }}>Image is shared across languages</span>
              </div>
            </div>

            <div className={styles.field}>
              <span className={styles.langBadge}>TITLE · {LOCALE_LABELS[L]}</span>
              <input className={styles.input} style={localizedInputStyle} value={s.title[L] ?? ""} onChange={(e) => patchStepL(i, "title", e.target.value)} />
            </div>
            <div className={styles.field}>
              <span className={styles.langBadge}>BODY · {LOCALE_LABELS[L]}</span>
              <textarea className={styles.textarea} style={{ ...localizedInputStyle, minHeight: 72 }} value={s.body[L] ?? ""} onChange={(e) => patchStepL(i, "body", e.target.value)} />
            </div>
            <div className={styles.field}>
              <span className={styles.langBadge}>TIP · {LOCALE_LABELS[L]}</span>
              <input className={styles.input} style={localizedInputStyle} value={s.tip[L] ?? ""} onChange={(e) => patchStepL(i, "tip", e.target.value)} />
            </div>
          </div>
        ))}
        <button className={styles.btn} onClick={addStep}>+ Add step</button>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <button className={styles.btn} onClick={onSave} disabled={busy !== ""}>{busy === "saving" ? "Saving…" : "Save draft"}</button>
        <button className={`${styles.btn} ${styles.btnAccent}`} onClick={onPublish} disabled={busy !== ""}>{status === "published" ? "Update live guide" : "Publish"}</button>
        <button className={styles.btn} onClick={() => router.push("/app")}>Back to guides</button>
      </div>
    </main>
  );
}
