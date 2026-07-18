"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { signUploads } from "@/lib/actions/uploads";
import { LOCALES, LOCALE_NAMES, scriptFontVar, type Locale } from "@/lib/locales";
import styles from "../dashboard.module.css";

const ACCEPT_IMG = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMG = 20;
const MAX_BYTES = 10 * 1024 * 1024;
const MANUAL_EXT = [".pdf", ".docx", ".txt"];
const MANUAL_MAX_BYTES = 25 * 1024 * 1024;

type Phase = "form" | "running";
type StepStatus = "pending" | "active" | "done" | "error";
interface ProgressStep {
  label: string;
  status: StepStatus;
}

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
  const [progress, setProgress] = useState<ProgressStep[]>([]);
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

    // Draft in one base language first, then add the rest one at a time. Each
    // request stays short (a single 6-language call hit Vercel's 504) and the
    // UI can report real progress.
    const base: Locale = languages.includes("en") ? "en" : languages[0];
    const others = languages.filter((l) => l !== base);
    const isPdf = !!manual && /\.pdf$/i.test(manual.name);

    const initial: ProgressStep[] = [];
    const IDX_PAGES = isPdf
      ? initial.push({ label: `Reading pages from ${manual!.name}`, status: "pending" }) - 1
      : -1;
    const IDX_UPLOAD = initial.push({ label: "Uploading files", status: "pending" }) - 1;
    const IDX_DRAFT =
      initial.push({ label: `Drafting the guide in ${LOCALE_NAMES[base]}`, status: "pending" }) - 1;
    const IDX_TRANS = initial.length;
    others.forEach((l) =>
      initial.push({ label: `Adding ${LOCALE_NAMES[l]}`, status: "pending" as StepStatus })
    );
    setProgress(initial);
    setPhase("running");

    const mark = (i: number, status: StepStatus) =>
      setProgress((prev) => prev.map((s, j) => (j === i ? { ...s, status } : s)));
    const relabel = (i: number, label: string, status: StepStatus) =>
      setProgress((prev) => prev.map((s, j) => (j === i ? { label, status } : s)));
    const fail = (i: number, msg: string) => {
      mark(i, "error");
      setPhase("form");
      setError(msg);
    };

    // 0. Pull the pictures out of the PDF in the browser: tightly-cropped
    //    embedded figures when the manual has them, otherwise whole-page
    //    renders. Non-fatal — we still generate from the extracted text.
    let pdfPages: File[] = [];
    if (isPdf && manual) {
      mark(IDX_PAGES, "active");
      try {
        const { extractPdfVisuals } = await import("@/lib/pdf-pages");
        const { files, mode } = await extractPdfVisuals(manual, {
          maxImages: Math.max(1, MAX_IMG - images.length),
        });
        pdfPages = files;
        relabel(
          IDX_PAGES,
          mode === "none" || files.length === 0
            ? "No pictures found in the PDF — using its text only"
            : `Extracted ${files.length} ${mode === "figures" ? "diagram" : "page"}${files.length === 1 ? "" : "s"} from ${manual.name}`,
          mode === "none" || files.length === 0 ? "error" : "done"
        );
      } catch {
        relabel(IDX_PAGES, "Couldn't read the PDF's pictures — using its text only", "error");
      }
    }

    // 1. Upload via service-role-signed URLs (no ~4.5MB server body limit, and
    //    the signed URL authorizes the write without a per-user Storage policy).
    const allImages = [...images, ...pdfPages].slice(0, MAX_IMG);
    relabel(
      IDX_UPLOAD,
      `Uploading ${allImages.length} image${allImages.length === 1 ? "" : "s"}${manual ? " + your PDF" : ""}`,
      "active"
    );
    const files: File[] = [...allImages];
    if (manual) files.push(manual);
    const manualIndex = manual ? files.length - 1 : -1;
    const items = files.map((f, i) => ({
      kind: (i === manualIndex ? "manual" : "image") as "image" | "manual",
      ext: f.name.split(".").pop() || (i === manualIndex ? "pdf" : "jpg"),
    }));

    const image_urls: string[] = [];
    let manual_url = "";
    let manual_name = "";
    if (items.length > 0) {
      const signed = await signUploads(items);
      if (!signed.ok || !signed.targets) {
        fail(IDX_UPLOAD, signed.message || "Upload failed. Try again.");
        return;
      }
      try {
        for (let i = 0; i < files.length; i++) {
          const target = signed.targets[i];
          const { error: upErr } = await supabase.storage
            .from("guide-images")
            .uploadToSignedUrl(target.path, target.token, files[i]);
          if (upErr) throw upErr;
          if (i === manualIndex) {
            manual_url = target.publicUrl;
            manual_name = files[i].name;
          } else {
            image_urls.push(target.publicUrl);
          }
        }
      } catch {
        fail(IDX_UPLOAD, "Upload failed. Check your connection and try again.");
        return;
      }
    }
    mark(IDX_UPLOAD, "done");

    // 2. Draft the base-language guide.
    mark(IDX_DRAFT, "active");
    const form = new FormData();
    form.set("product_name", name.trim());
    form.set("model_no", modelNo.trim());
    form.set("notes", notes.trim());
    form.set("image_urls", JSON.stringify(image_urls));
    form.set("languages", JSON.stringify([base]));
    if (manual_url) {
      form.set("manual_url", manual_url);
      form.set("manual_name", manual_name);
    }

    let guideId = "";
    try {
      const res = await fetch("/api/generate", { method: "POST", body: form });
      let json: { guideId?: string; error?: string } = {};
      try {
        json = await res.json();
      } catch {
        /* a gateway timeout returns HTML, not JSON */
      }
      if (!res.ok) {
        fail(
          IDX_DRAFT,
          res.status === 504
            ? "Drafting timed out. Try a shorter PDF or fewer photos."
            : json.error || `Generation failed (${res.status}) — try again.`
        );
        return;
      }
      if (!json.guideId) {
        fail(IDX_DRAFT, "Generation didn't return a guide — try again.");
        return;
      }
      guideId = json.guideId;
    } catch {
      fail(IDX_DRAFT, "Network error — try again.");
      return;
    }
    mark(IDX_DRAFT, "done");

    // 3. Add each remaining language. A failure here is non-fatal — the guide
    //    already exists, so we keep going and land the seller in the editor.
    for (let k = 0; k < others.length; k++) {
      const idx = IDX_TRANS + k;
      mark(idx, "active");
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ guideId, locale: others[k] }),
        });
        mark(idx, res.ok ? "done" : "error");
      } catch {
        mark(idx, "error");
      }
    }

    router.push(`/app/guide/${guideId}`);
  }

  if (phase === "running") {
    const done = progress.filter((s) => s.status === "done").length;
    return (
      <main className={styles.container}>
        <div className={styles.pageHead}>
          <div>
            <h1 className={styles.h1}>Building your guide…</h1>
            <p className={styles.sub}>
              {done} of {progress.length} done · you&apos;ll land in the editor automatically.
            </p>
          </div>
        </div>

        <div className={styles.panel}>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 14 }}>
            {progress.map((s, i) => (
              <li key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span
                  aria-hidden
                  style={{
                    width: 22,
                    height: 22,
                    flexShrink: 0,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                    fontWeight: 700,
                    color: s.status === "done" ? "#fff" : s.status === "error" ? "#fff" : "var(--color-ink-soft)",
                    background:
                      s.status === "done"
                        ? "var(--color-green)"
                        : s.status === "error"
                          ? "var(--color-accent)"
                          : "transparent",
                    border:
                      s.status === "done" || s.status === "error"
                        ? "none"
                        : s.status === "active"
                          ? "2.5px solid var(--color-accent)"
                          : "2px solid var(--color-line)",
                    borderTopColor: s.status === "active" ? "transparent" : undefined,
                    animation: s.status === "active" ? "sdspin 0.8s linear infinite" : undefined,
                  }}
                >
                  {s.status === "done" ? "✓" : s.status === "error" ? "!" : ""}
                </span>
                <span
                  style={{
                    fontSize: 15,
                    fontWeight: s.status === "active" ? 600 : 500,
                    color:
                      s.status === "pending"
                        ? "var(--color-ink-soft)"
                        : s.status === "error"
                          ? "var(--color-accent)"
                          : "var(--color-ink)",
                  }}
                >
                  {s.label}
                  {s.status === "error" && " — skipped, you can add it later"}
                </span>
              </li>
            ))}
          </ul>
          <style>{`@keyframes sdspin{to{transform:rotate(360deg)}}`}</style>
        </div>

        {error && <div className={styles.notice}>{error}</div>}
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
