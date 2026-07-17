"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import styles from "../dashboard.module.css";

const ACCEPT_IMG = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMG = 20;
const MAX_BYTES = 10 * 1024 * 1024;

type Phase = "form" | "uploading" | "generating";

export default function NewGuidePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [modelNo, setModelNo] = useState("");
  const [notes, setNotes] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [manual, setManual] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [phase, setPhase] = useState<Phase>("form");
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

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

    // 1. upload images to storage → public URLs
    setPhase("uploading");
    const prefix = `${user.id}/${crypto.randomUUID()}`;
    const image_urls: string[] = [];
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
    } catch {
      setPhase("form");
      setError("Image upload failed. Check your connection and try again.");
      return;
    }

    // 2. call generate
    setPhase("generating");
    const form = new FormData();
    form.set("product_name", name.trim());
    form.set("model_no", modelNo.trim());
    form.set("notes", notes.trim());
    form.set("image_urls", JSON.stringify(image_urls));
    if (manual) form.set("manual", manual);

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
          <h2>{phase === "uploading" ? "Uploading photos…" : "AI is building your guide…"}</h2>
          <p>
            {phase === "uploading"
              ? `Sending ${images.length} image${images.length === 1 ? "" : "s"} to storage.`
              : "Reading your photos and notes, sequencing steps, and writing both languages. This usually takes under a minute."}
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
          <p className={styles.sub}>Upload photos and notes — AI drafts the bilingual steps.</p>
        </div>
        <Link href="/app" className={styles.btn}>
          Cancel
        </Link>
      </div>

      {error && <div className={styles.notice}>{error}</div>}

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
        <div className={styles.panelTitle}>Photos</div>
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
        <div className={styles.panelTitle}>Notes & existing manual</div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="notes">
            Rough notes
          </label>
          <textarea
            id="notes"
            className={styles.textarea}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Bullet points, assembly order, gotchas — anything. AI will structure it."
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="manual">
            Existing manual (optional — PDF, DOCX, or TXT)
          </label>
          <input
            id="manual"
            type="file"
            accept=".pdf,.docx,.txt"
            className={styles.input}
            onChange={(e) => setManual(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>

      <button className={`${styles.btn} ${styles.btnAccent}`} onClick={onGenerate}>
        Generate guide →
      </button>
    </main>
  );
}
