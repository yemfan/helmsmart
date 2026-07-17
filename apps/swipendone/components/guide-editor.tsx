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
import type { Part } from "@/lib/types";
import styles from "@/app/app/dashboard.module.css";

interface Props {
  guideId: string;
  data: GuideEdit;
  analytics: GuideAnalytics;
  brandName: string;
  appUrl: string;
}

const emptyStep = (): SaveStepInput => ({
  position: 0,
  title_en: "",
  title_zh: "",
  body_en: "",
  body_zh: "",
  tip_en: "",
  tip_zh: "",
  image_url: null,
});

export function GuideEditor({ guideId, data, analytics, brandName, appUrl }: Props) {
  const router = useRouter();

  const [nameEn, setNameEn] = useState(data.product.name_en);
  const [nameZh, setNameZh] = useState(data.product.name_zh ?? "");
  const [modelNo, setModelNo] = useState(data.product.model_no ?? "");
  const [brand, setBrand] = useState(brandName);

  const [metaEn, setMetaEn] = useState({
    time_estimate: data.guide.meta_en?.time_estimate ?? "",
    people: data.guide.meta_en?.people ?? "",
    tools: data.guide.meta_en?.tools ?? "",
  });
  const [metaZh, setMetaZh] = useState({
    time_estimate: data.guide.meta_zh?.time_estimate ?? "",
    people: data.guide.meta_zh?.people ?? "",
    tools: data.guide.meta_zh?.tools ?? "",
  });

  const [parts, setParts] = useState<Part[]>(data.guide.parts ?? []);
  const [steps, setSteps] = useState<SaveStepInput[]>(
    data.steps.map((s) => ({
      position: s.position,
      title_en: s.title_en ?? "",
      title_zh: s.title_zh ?? "",
      body_en: s.body_en ?? "",
      body_zh: s.body_zh ?? "",
      tip_en: s.tip_en ?? "",
      tip_zh: s.tip_zh ?? "",
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
  function removeStep(i: number) {
    setSteps((prev) => prev.filter((_, j) => j !== i));
  }
  function addStep() {
    setSteps((prev) => [...prev, emptyStep()]);
  }

  function patchPart(i: number, patch: Partial<Part>) {
    setParts((prev) => prev.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  }
  function addPart() {
    const nextCode = String.fromCharCode(65 + parts.length); // A, B, C…
    setParts((prev) => [...prev, { code: nextCode, name_en: "", name_zh: "", qty: 1 }]);
  }
  function removePart(i: number) {
    setParts((prev) => prev.filter((_, j) => j !== i));
  }

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
      name_en: nameEn,
      name_zh: nameZh,
      model_no: modelNo,
      meta_en: metaEn,
      meta_zh: metaZh,
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
    if (res.ok) setMsg({ text: "Saved.", ok: true });
    else setMsg({ text: res.message ?? "Save failed.", ok: false });
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

  return (
    <main className={styles.container}>
      <input
        ref={stepFileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onStepFileChosen(f);
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
          <button
            className={`${styles.btn} ${styles.btnAccent}`}
            onClick={onPublish}
            disabled={busy !== ""}
          >
            {busy === "publishing" ? "Publishing…" : status === "published" ? "Update live guide" : "Publish"}
          </button>
        </div>
      </div>

      {msg && (
        <div
          className={styles.notice}
          style={{
            background: msg.ok ? "var(--color-green-soft)" : "#fff7f3",
            borderColor: msg.ok ? "#bfe0cd" : "#f6c9b6",
            color: msg.ok ? "var(--color-green)" : "#9a3d1a",
          }}
          role="status"
        >
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
                <a className={styles.btn} href={hostedUrl} target="_blank" rel="noreferrer">
                  Open
                </a>
              </div>
              <div className={styles.linkRow}>
                <a className={styles.btn} href={`/g/${slug}/qr?download=1`} download>
                  Download QR (PNG)
                </a>
                <a className={styles.btn} href={`/g/${slug}/qr?f=svg&download=1`} download>
                  QR (SVG)
                </a>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 22 }}>
            <div className={styles.panelTitle} style={{ fontSize: 15 }}>
              Analytics
            </div>
            <div className={styles.statRow}>
              <div className={styles.stat}>
                <span className={styles.statNum}>{analytics.scans}</span>
                <span className={styles.statLabel}>Total scans</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statNum}>{analytics.finished}</span>
                <span className={styles.statLabel}>Completed</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statNum}>{analytics.completionRate}%</span>
                <span className={styles.statLabel}>Completion rate</span>
              </div>
            </div>
            {analytics.perStepViews.length > 0 &&
              (() => {
                const max = Math.max(...analytics.perStepViews.map((s) => s.views), 1);
                return (
                  <div>
                    {analytics.perStepViews.map((s) => (
                      <div key={s.position} className={styles.barRow}>
                        <span className={styles.barLabel}>Step {s.position}</span>
                        <span className={styles.barTrack}>
                          <span
                            className={styles.barFill}
                            style={{ width: `${(s.views / max) * 100}%` }}
                          />
                        </span>
                        <span>{s.views}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
          </div>

          <div style={{ marginTop: 18 }}>
            {status === "published" ? (
              <button className={styles.btn} onClick={() => onStatus("archived")}>
                Unpublish (archive)
              </button>
            ) : null}
          </div>
        </div>
      )}

      {status === "archived" && (
        <div className={styles.panel}>
          <div className={styles.panelTitle}>Archived</div>
          <p className={styles.sub} style={{ marginBottom: 12 }}>
            This guide is not publicly visible. Republish to bring it back at the same link.
          </p>
          <button className={styles.btn} onClick={() => onStatus("draft")}>
            Move to draft
          </button>
        </div>
      )}

      {/* Product + brand */}
      <div className={styles.panel}>
        <div className={styles.panelTitle}>Product & brand</div>
        <div className={styles.field}>
          <label className={styles.label}>Brand name (shown on the guide header)</label>
          <input className={styles.input} value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="NORDHOLM" />
        </div>
        <div className={styles.bilingualRow}>
          <div className={styles.field}>
            <span className={styles.langBadge}>PRODUCT NAME · EN</span>
            <input className={styles.input} value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
          </div>
          <div className={styles.field}>
            <span className={styles.langBadge}>产品名称 · 中文</span>
            <input className={styles.input} value={nameZh} onChange={(e) => setNameZh(e.target.value)} />
          </div>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Model number</label>
          <input className={styles.input} value={modelNo} onChange={(e) => setModelNo(e.target.value)} />
        </div>
      </div>

      {/* Meta */}
      <div className={styles.panel}>
        <div className={styles.panelTitle}>Overview (cover card)</div>
        <div className={styles.bilingualRow}>
          <div>
            <span className={styles.langBadge}>ENGLISH</span>
            {(["time_estimate", "people", "tools"] as const).map((k) => (
              <div className={styles.field} key={k}>
                <input
                  className={styles.input}
                  value={metaEn[k]}
                  placeholder={k === "time_estimate" ? "About 25 minutes" : k === "people" ? "2 people recommended" : "Phillips screwdriver (hex key included)"}
                  onChange={(e) => setMetaEn({ ...metaEn, [k]: e.target.value })}
                />
              </div>
            ))}
          </div>
          <div>
            <span className={styles.langBadge}>中文</span>
            {(["time_estimate", "people", "tools"] as const).map((k) => (
              <div className={styles.field} key={k}>
                <input
                  className={styles.input}
                  value={metaZh[k]}
                  placeholder={k === "time_estimate" ? "约25分钟" : k === "people" ? "建议两人安装" : "十字螺丝刀（内含六角扳手）"}
                  onChange={(e) => setMetaZh({ ...metaZh, [k]: e.target.value })}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Parts */}
      <div className={styles.panel}>
        <div className={styles.panelTitle}>Parts checklist</div>
        {parts.map((p, i) => (
          <div key={i} className={styles.stepEditor}>
            <div className={styles.stepEditorHead}>
              <input
                className={styles.input}
                style={{ width: 60 }}
                value={p.code}
                onChange={(e) => patchPart(i, { code: e.target.value })}
                aria-label="Part code"
              />
              <input
                className={styles.input}
                style={{ width: 80 }}
                type="number"
                min={0}
                value={p.qty}
                onChange={(e) => patchPart(i, { qty: Number(e.target.value) })}
                aria-label="Quantity"
              />
              <button className={styles.iconBtn} onClick={() => removePart(i)} aria-label="Remove part">
                ✕
              </button>
            </div>
            <div className={styles.bilingualRow}>
              <input
                className={styles.input}
                value={p.name_en}
                placeholder="Side panel"
                onChange={(e) => patchPart(i, { name_en: e.target.value })}
              />
              <input
                className={styles.input}
                value={p.name_zh ?? ""}
                placeholder="侧板"
                onChange={(e) => patchPart(i, { name_zh: e.target.value })}
              />
            </div>
          </div>
        ))}
        <button className={styles.btn} onClick={addPart}>
          + Add part
        </button>
      </div>

      {/* Steps */}
      <div className={styles.panel}>
        <div className={styles.panelTitle}>Steps</div>
        {steps.map((s, i) => (
          <div key={i} className={styles.stepEditor}>
            <div className={styles.stepEditorHead}>
              <span className={styles.stepNo}>{String(i + 1).padStart(2, "0")}</span>
              <div style={{ display: "flex", gap: 6 }}>
                <button className={styles.iconBtn} onClick={() => moveStep(i, -1)} disabled={i === 0} aria-label="Move up">
                  ↑
                </button>
                <button
                  className={styles.iconBtn}
                  onClick={() => moveStep(i, 1)}
                  disabled={i === steps.length - 1}
                  aria-label="Move down"
                >
                  ↓
                </button>
                <button className={styles.iconBtn} onClick={() => removeStep(i)} aria-label="Remove step">
                  ✕
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 12, flexWrap: "wrap" }}>
              <div className={styles.thumb} style={{ width: 96, height: 96, flexShrink: 0 }}>
                {s.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.image_url} alt={`Step ${i + 1}`} />
                ) : (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: 11, color: "var(--color-ink-soft)" }}>
                    No image
                  </div>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <button className={styles.iconBtn} onClick={() => onPickStepImage(i)}>
                  {s.image_url ? "Change image" : "Add image"}
                </button>
                {s.image_url && (
                  <button className={styles.iconBtn} onClick={() => patchStep(i, { image_url: null })}>
                    Clear image
                  </button>
                )}
              </div>
            </div>

            <div className={styles.bilingualRow}>
              <div>
                <span className={styles.langBadge}>TITLE · EN</span>
                <input className={styles.input} value={s.title_en} onChange={(e) => patchStep(i, { title_en: e.target.value })} />
              </div>
              <div>
                <span className={styles.langBadge}>标题 · 中文</span>
                <input className={styles.input} value={s.title_zh} onChange={(e) => patchStep(i, { title_zh: e.target.value })} />
              </div>
            </div>
            <div className={styles.bilingualRow} style={{ marginTop: 10 }}>
              <div>
                <span className={styles.langBadge}>BODY · EN</span>
                <textarea className={styles.textarea} style={{ minHeight: 72 }} value={s.body_en} onChange={(e) => patchStep(i, { body_en: e.target.value })} />
              </div>
              <div>
                <span className={styles.langBadge}>正文 · 中文</span>
                <textarea className={styles.textarea} style={{ minHeight: 72 }} value={s.body_zh} onChange={(e) => patchStep(i, { body_zh: e.target.value })} />
              </div>
            </div>
            <div className={styles.bilingualRow} style={{ marginTop: 10 }}>
              <div>
                <span className={styles.langBadge}>TIP · EN</span>
                <input className={styles.input} value={s.tip_en} onChange={(e) => patchStep(i, { tip_en: e.target.value })} />
              </div>
              <div>
                <span className={styles.langBadge}>提示 · 中文</span>
                <input className={styles.input} value={s.tip_zh} onChange={(e) => patchStep(i, { tip_zh: e.target.value })} />
              </div>
            </div>
          </div>
        ))}
        <button className={styles.btn} onClick={addStep}>
          + Add step
        </button>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <button className={styles.btn} onClick={onSave} disabled={busy !== ""}>
          {busy === "saving" ? "Saving…" : "Save draft"}
        </button>
        <button className={`${styles.btn} ${styles.btnAccent}`} onClick={onPublish} disabled={busy !== ""}>
          {status === "published" ? "Update live guide" : "Publish"}
        </button>
        <button className={styles.btn} onClick={() => router.push("/app")}>
          Back to guides
        </button>
      </div>
    </main>
  );
}
