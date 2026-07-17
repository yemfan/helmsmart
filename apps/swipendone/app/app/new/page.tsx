"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { LOCALES, LOCALE_NAMES, scriptFontVar, type Locale } from "@/lib/locales";
import styles from "../dashboard.module.css";

const ACCEPT_IMG = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMG = 20;
const MAX_BYTES = 10 * 1024 * 1024;
const MANUAL_EXT = [".pdf", ".docx", ".txt"];
const MANUAL_MAX_BYTES = 25 * 1024 * 1024;

type Phase = "form" | "uploading" | "generating";

export default function NewGuidePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [modelNo, setModelNo] = useState("");
  const [notes, setNotes] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [manual, setManual] = useState<File | null>(null);
  const [languages, setLanguages] = useState<Locale[]>([...LOCALES]);
  const [dragOver, setDragOver] = useState(false);
  const [manualDrag, setManualDrag] = useState(false);
  const [phase, setPhase] = useState<Phase>("form");
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const manualInput = useRef<HTMLInputElement>(null);

  function setManualFile(f: File) {
    const okExt = MANUAL_EXT.some((e) => f.name.toLowerCase().endsWith(e));
    if (!okExt) {
      setError("Installation guide must be a PDF, DOCX, or TXT file.");
      return;
    }
    if (f.size > MANUAL_MAX_BYTES) {
      setError("That file is over 25MB — please upload a smaller PDF.");
      return;
    }
    setError("");
    setManual(f);
  }

  function toggleLang(l: Locale) {
    setLanguages((prev) => {
      const on = prev.includes(l);
      if (on && prev.length === 1) return prev; // keep at least one
      const next = on ? prev.filter((x) => x !== l) : [...prev, l];
      return LOCALES.filter((x) => next.includes(x));
    });
  }

  const previews = images.map((f) => ({ file: f, url: URL.createObjectURL(f) }));

  function addImages(list: FileList | File[]) {
    const incoming = Array.from(list).filter(
      (f) => ACCEPT_IMG.includes(f.type) && f.size <= MAX_BYTES
    );
    setImages((prev) => [...prev, ...incoming].slice(0, MAX_IMG));
  }

  async function onGenerate() {
    setError("");
    if (!name.trim()) {
      setError("Product name is required.");
      return;
    }
    const supabase = createClient();
    if (!supabase) {
      setError("Supabase isn't configured.");
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    // 1. upload images + the manual PDF to storage → URLs (keeps big PDFs off the
    //    generate request, which has a ~4.5MB body limit).
    setPhase("uploading");
    const prefix = `${user.id}/${crypto.randomUUID()}`;
    const image_urls: string[] = [];
    let manual_url = "";
    let manual_name = "";
    try {
      for (let i = 0; i < images.length; i++) {
        const file = images[i];
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${prefix}/${i}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("guide-images")
          .upload(path, file, { upsert: true, contentType: file.type });
        if (upErr) throw upErr;
        const { data } = supabase.storage.from("guide-images").getPublicUrl(path);
        image_urls.push(data.publicUrl);
      }
      if (manual) {
        const ext = manual.name.split(".").pop() || "pdf";
        const path = `${prefix}/manual.${ext}`;
        const { error: mErr } = await supabase.storage
          .from("guide-images")
          .upload(path, manual, { upsert: true, contentType: manual.type || "application/octet-stream" });
        if (mErr) throw mErr;
        manual_url = supabase.storage.from("guide-images").getPublicUrl(path).data.publicUrl;
        manual_name = manual.name;
      }
    } catch {
      setPhase("form");
      setError("Upload failed. Check your connection and try again.");
      return;
    }

    // 2. call generate
    setPhase("generating");
    const form = new FormData();
    form.set("product_name", name.trim());
    form.set("model_no", modelNo.trim());
    form.set("notes", notes.trim());
    form.set("image_urls", JSON.stringify(image_urls));
    form.set("languages", JSON.stringify(languages));
    if (manual_url) {
      form.set("manual_url", manual_url);
      form.set("manual_name", manual_name);
    }

    try {
      const res = await fetch("/api/generate", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) {
        setPhase("form");
        setError(json.error || "Generation failed — try again.");
        return;
      }
      router.push(`/app/guide/${json.guideId}`);
    } catch {
      setPhase("form");
      setError("Network error — try again.");
    }
  }

  if (phase !== "form") {
    return (
      <main className={styles.container}>
        <div className={styles.empty}>
          <h2>{phase === "uploading" ? "Uploading…" : "AI is building your guide…"}</h2>
          <p>
            {phase === "uploading"
              ? `Sending ${manual ? "your PDF" : ""}${manual && images.length ? " and " : ""}${images.length ? `${images.length} image${images.length === 1 ? "" : "s"}` : ""} to storage.`
              : manual
                ? "Reading your PDF, restructuring the steps, and writing every language you picked. This usually takes under a minute."
                : "Reading your photos and notes, sequencing steps, and writing every language you picked. This usually takes under a minute."}
          </p>
          <div
            aria-hidden
            style={{
              width: 40,
              height: 40,
              margin: "8px auto 0",
              border: "3px solid var(--color-line)",
              borderTopColor: "var(--color-accent)",
              borderRadius: "50%",
              animation: "sdspin 0.8s linear infinite",
            }}
          />
          <style>{`@keyframes sdspin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.container}>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.h1}>New guide</h1>
          <p className={styles.sub}>Start from an existing PDF, or from photos and notes — AI drafts the steps in every language you pick.</p>
        </div>
        <Link href="/app" className={styles.btn}>
          Cancel
        </Link>
      </div>

      {error && <div className={styles.notice}>{error}</div>}

      {/* PDF-first entry point */}
      <div
        className={`${styles.drop} ${manual ? styles.dropActive : ""}`}
        onClick={() => manualInput.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setManualDrag(true);
        }}
        onDragLeave={() => setManualDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setManualDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) setManualFile(f);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && manualInput.current?.click()}
        style={{
          marginBottom: 16,
          textAlign: "left",
          display: "flex",
          alignItems: "center",
          gap: 16,
          borderColor: manual || manualDrag ? "var(--color-accent)" : undefined,
          background: manual || manualDrag ? "#fff7f3" : undefined,
        }}
      >
        <div style={{ fontSize: 30, lineHeight: 1 }} aria-hidden>
          📄
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, color: "var(--color-ink)" }}>
            Already have an installation guide in PDF?
          </div>
          <div style={{ fontSize: 13, color: "var(--color-ink-soft)", marginTop: 2 }}>
            {manual ? (
              <>
                <strong>{manual.name}</strong> attached — AI will rebuild it as a swipeable, multilingual guide.
              </>
            ) : (
              <>Upload it here (PDF, DOCX, or TXT) and AI rebuilds it as a swipeable, multilingual guide. Add photos below if you have them.</>
            )}
          </div>
        </div>
        {manual ? (
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="Remove file"
            onClick={(e) => {
              e.stopPropagation();
              setManual(null);
            }}
          >
            ✕
          </button>
        ) : (
          <span className={`${styles.btn}`} style={{ pointerEvents: "none" }}>
            Choose PDF
          </span>
        )}
        <input
          ref={manualInput}
          type="file"
          accept=".pdf,.docx,.txt"
          hidden
          onChange={(e) => e.target.files?.[0] && setManualFile(e.target.files[0])}
        />
      </div>

      <div className={styles.panel}>
        <div className={styles.panelTitle}>Product</div>
        <div className={styles.row2}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="pname">
              Product name *
            </label>
            <input
              id="pname"
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Lund TV Stand"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="pmodel">
              Model number
            </label>
            <input
              id="pmodel"
              className={styles.input}
              value={modelNo}
              onChange={(e) => setModelNo(e.target.value)}
              placeholder="TV-2140"
            />
          </div>
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelTitle}>Photos {manual ? "(optional)" : ""}</div>
        <div
          className={`${styles.drop} ${dragOver ? styles.dropActive : ""}`}
          onClick={() => fileInput.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            addImages(e.dataTransfer.files);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileInput.current?.click()}
        >
          <p>
            <strong>Drop photos here</strong> or click to browse
          </p>
          <p style={{ fontSize: 13, marginTop: 4 }}>
            JPEG, PNG or WebP · up to 10MB each · max {MAX_IMG}
          </p>
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT_IMG.join(",")}
            multiple
            hidden
            onChange={(e) => e.target.files && addImages(e.target.files)}
          />
        </div>
        {previews.length > 0 && (
          <div className={styles.thumbs}>
            {previews.map((p, i) => (
              <div key={i} className={styles.thumb}>
                {/* Local blob preview before upload — next/image can't optimize object URLs. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={`Upload ${i + 1}`} />
                <button
                  type="button"
                  className={styles.thumbRemove}
                  aria-label="Remove image"
                  onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.panel}>
        <div className={styles.panelTitle}>Notes</div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="notes">
            Rough notes (optional)
          </label>
          <textarea
            id="notes"
            className={styles.textarea}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Bullet points, assembly order, gotchas — anything. AI will structure it."
          />
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelTitle}>Languages</div>
        <p className={styles.sub} style={{ marginBottom: 12 }}>
          AI writes the guide natively in every language you pick. You can adjust these later.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {LOCALES.map((l) => {
            const on = languages.includes(l);
            return (
              <button
                key={l}
                type="button"
                onClick={() => toggleLang(l)}
                className={styles.iconBtn}
                aria-pressed={on}
                style={{
                  fontFamily: scriptFontVar(l),
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
        <p className={styles.sub} style={{ marginTop: 10 }}>
          {languages.length} language{languages.length === 1 ? "" : "s"} selected
        </p>
      </div>

      <button className={`${styles.btn} ${styles.btnAccent}`} onClick={onGenerate}>
        Generate guide →
      </button>
    </main>
  );
}
