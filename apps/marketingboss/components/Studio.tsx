"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "image" | "video";
const ASPECTS = ["16:9", "9:16", "1:1", "4:3", "3:4"] as const;
type Aspect = (typeof ASPECTS)[number];

const EXAMPLES = [
  "Product hero shot of a matte-black skincare bottle on wet stone, water droplets, soft studio rim light, shallow depth of field, editorial, teal-and-amber grade",
  "Bold Instagram ad: fresh iced coffee splashing mid-air on a peach background, high-speed capture, punchy colors, negative space for a headline",
  "Cinematic real-estate twilight exterior of a modern hillside home, warm interior glow, pool reflection, wide 24mm, dramatic sky",
];

export default function Studio() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [uid, setUid] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("image");
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState<Aspect>("16:9");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<string[]>([]);

  const [refUrl, setRefUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null));
  }, [supabase]);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Reference must be an image.");
      return;
    }
    if (!uid) {
      setError("Still signing in — try again in a second.");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${uid}/refs/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("media")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const url = supabase.storage.from("media").getPublicUrl(path).data.publicUrl;
      setRefUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function run() {
    const p = prompt.trim();
    if (!p || loading) return;
    setLoading(true);
    setError(null);
    setResults([]);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: mode, prompt: p, aspect, imageUrl: refUrl || undefined }),
      });
      const data = (await res.json()) as { urls?: string[]; error?: string };
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setResults(data.urls || []);
      router.refresh(); // update the credit badge in the nav
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const hasRef = !!refUrl;
  const actionLabel = loading
    ? mode === "video"
      ? "Rendering…"
      : hasRef
        ? "Editing…"
        : "Generating…"
    : hasRef
      ? mode === "video"
        ? "Animate image"
        : "Edit image"
      : `Generate ${mode}`;

  const placeholder = hasRef
    ? mode === "video"
      ? "Describe the motion + camera move to animate this image…"
      : "Describe the change or new scene (restyle, swap background, place this person/product)…"
    : mode === "image"
      ? "Describe the marketing image you want…"
      : "Describe the clip — subject, motion, and camera move…";

  const isCreditError = !!error && /credit/i.test(error);

  return (
    <>
      <section className="rounded-2xl border border-white/10 bg-ink-2/70 p-4 backdrop-blur sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-white/10 bg-black/30 p-1 text-sm">
            {(["image", "video"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-md px-4 py-1.5 font-medium capitalize transition ${
                  mode === m ? "bg-boss-violet text-white shadow" : "text-white/60 hover:text-white"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {/* reference image */}
          {hasRef ? (
            <div className="ml-1 flex items-center gap-2 rounded-lg border border-boss-gold/30 bg-boss-gold/10 py-1 pl-1 pr-2 text-xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={refUrl!} alt="reference" className="size-7 rounded object-cover" />
              <span className="text-white/70">{mode === "video" ? "Source frame" : "Reference"}</span>
              <button onClick={() => setRefUrl(null)} className="text-white/50 hover:text-white" aria-label="remove reference">
                ×
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="ml-1 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs font-medium text-white/60 transition hover:text-white disabled:opacity-40"
            >
              {uploading ? "Uploading…" : "+ Reference image"}
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} className="hidden" />
        </div>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run();
          }}
          rows={4}
          placeholder={placeholder}
          className="w-full resize-y rounded-xl border border-white/10 bg-black/30 p-3.5 text-[15px] leading-relaxed text-white placeholder:text-white/35 outline-none focus:border-boss-violet/60 focus:ring-2 focus:ring-boss-violet/20"
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!hasRef && (
            <>
              <span className="text-xs font-medium text-white/40">Aspect</span>
              {ASPECTS.map((a) => (
                <button
                  key={a}
                  onClick={() => setAspect(a)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ring-1 transition ${
                    aspect === a
                      ? "bg-white/10 text-white ring-white/25"
                      : "text-white/50 ring-white/10 hover:text-white/80"
                  }`}
                >
                  {a}
                </button>
              ))}
            </>
          )}
          {hasRef && mode === "image" && (
            <span className="text-xs text-white/40">Editing your reference with nano-banana</span>
          )}

          <button
            onClick={run}
            disabled={loading || !prompt.trim()}
            className="ml-auto inline-flex items-center gap-2 rounded-xl bg-boss-gold px-5 py-2.5 text-sm font-semibold text-black transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading && <Spinner />}
            {actionLabel}
          </button>
        </div>

        {!prompt && !hasRef && (
          <div className="mt-4 flex flex-col gap-1.5">
            <span className="text-xs text-white/35">Try one:</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setPrompt(ex)}
                className="truncate rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-left text-xs text-white/55 transition hover:border-white/15 hover:text-white/80"
              >
                {ex}
              </button>
            ))}
          </div>
        )}
      </section>

      {loading && (
        <p className="text-center text-sm text-white/45">
          {mode === "video"
            ? "Rendering video — this usually takes 1–3 minutes."
            : hasRef
              ? "Editing your image…"
              : "Painting your image…"}
        </p>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-sm text-red-200">
          {error}
          {isCreditError && (
            <Link
              href="/billing"
              className="ml-2 inline-block font-semibold text-boss-gold underline underline-offset-2 hover:brightness-110"
            >
              Buy more credits →
            </Link>
          )}
        </div>
      )}

      {results.length > 0 && (
        <section className="grid grid-cols-1 gap-4">
          {results.map((url) => (
            <figure key={url} className="overflow-hidden rounded-2xl border border-white/10 bg-black/40">
              {mode === "video" ? (
                <video src={url} controls autoPlay loop muted className="w-full" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="Generated marketing creative" className="w-full" />
              )}
              <figcaption className="flex items-center justify-between px-3 py-2 text-xs text-white/50">
                <span className="capitalize">{mode} · saved to your gallery</span>
                <a href={url} download target="_blank" rel="noreferrer" className="font-medium text-boss-gold hover:underline">
                  Download ↗
                </a>
              </figcaption>
            </figure>
          ))}
        </section>
      )}
    </>
  );
}

function Spinner() {
  return <span className="size-4 animate-spin rounded-full border-2 border-black/30 border-t-black" aria-hidden />;
}
