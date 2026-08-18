"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PRESETS } from "@/lib/presets";
import { CREDIT_COST } from "@/lib/creditCosts";
import SocialPublish, { type SocialStatus } from "@/components/SocialPublish";

type Mode = "image" | "video" | "swap";
type SwapTarget = "face" | "person" | "outfit" | "product" | "background";
const ASPECTS = ["16:9", "9:16", "1:1", "4:3", "3:4"] as const;
type Aspect = (typeof ASPECTS)[number];

/** fal's swap model floor. Below this it 422s — see app/api/swap/route.ts. */
const MIN_SWAP_WIDTH = 720;

/**
 * Read a local video's pixel dimensions without uploading it. Resolves from the
 * `loadedmetadata` event, which fires long before the file is fully buffered.
 * Rejects on anything the browser can't decode; callers treat that as unknown
 * and let the server decide rather than blocking a possibly-valid upload.
 */
function readVideoSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement("video");
    el.preload = "metadata";
    const done = (fn: () => void) => {
      URL.revokeObjectURL(url);
      fn();
    };
    el.onloadedmetadata = () =>
      done(() => resolve({ width: el.videoWidth, height: el.videoHeight }));
    el.onerror = () => done(() => reject(new Error("Could not read that video.")));
    el.src = url;
  });
}

type StudioProps = {
  youtubeEnabled?: boolean;
  youtubeConnected?: boolean;
  youtubeChannel?: string | null;
  social?: SocialStatus;
  brandName?: string | null;
};

export default function Studio({
  youtubeEnabled = false,
  youtubeConnected = false,
  youtubeChannel = null,
  social,
  brandName = null,
}: StudioProps) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [uid, setUid] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("image");
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState<Aspect>("16:9");
  // Which preset is currently applied (highlighted) — cleared once the user
  // edits the prompt/mode/aspect so the highlight always reflects real state.
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<string[]>([]);
  const [resultMode, setResultMode] = useState<Mode>("image");
  const [resultPrompt, setResultPrompt] = useState("");
  const [resultAspect, setResultAspect] = useState<string>("16:9");
  const [modalOpen, setModalOpen] = useState(false);

  const [refUrl, setRefUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Swap mode (video-to-video edit): a source clip + reference image + target.
  const [srcVideoUrl, setSrcVideoUrl] = useState<string | null>(null);
  const [srcVideoName, setSrcVideoName] = useState<string | null>(null);
  // Draft text for the direct-URL field — committed only on Use/Enter, so
  // typing doesn't collapse the input into the preview player mid-keystroke.
  const [srcUrlText, setSrcUrlText] = useState("");
  const [srcUrlError, setSrcUrlError] = useState<string | null>(null);

  function commitSrcUrl() {
    const url = srcUrlText.trim();
    if (!url) return;
    if (!/^https?:\/\/\S+\.(mp4|mov|webm)(\?\S*)?$/i.test(url)) {
      setSrcUrlError("That needs to be a direct video file link ending in .mp4, .mov or .webm — page links (YouTube/TikTok) won't work.");
      return;
    }
    setSrcUrlError(null);
    setSrcVideoUrl(url);
    setSrcVideoName(null);
  }
  const [srcUploading, setSrcUploading] = useState(false);
  /** Source clip dimensions, read locally at pick time. null = couldn't measure. */
  const [srcSize, setSrcSize] = useState<{ width: number; height: number } | null>(null);
  /** Tick to prepend an upscale pass to the swap, in one click. */
  const [upscaleFirst, setUpscaleFirst] = useState(true);
  /** Which leg of a chained run is in flight, for the button label. */
  const [stage, setStage] = useState<"upscaling" | "swapping" | null>(null);
  /**
   * Whether Run swap will chain an upscale pass first. Drives the cost line and
   * the step labels, so the extra credits are stated before the click, not after.
   */
  const willUpscale =
    upscaleFirst && !!srcSize && srcSize.width > 0 && srcSize.width < MIN_SWAP_WIDTH;
  const [swapTarget, setSwapTarget] = useState<SwapTarget>("face");
  const videoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null));
  }, [supabase]);

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen]);

  function applyPreset(id: string) {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    setRefUrl(null);
    setMode(p.mode);
    setAspect(p.aspect);
    setPrompt(p.prompt);
    setActivePreset(id);
  }

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

  async function onPickVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setError("Source must be a video file.");
      return;
    }
    // fal only rejects an undersized clip AFTER the upload and the credit
    // reservation, so the user waited, then read a raw 422. The browser knows
    // the size immediately — measure now so the panel can offer an upscale
    // instead of failing them at the end. Unreadable metadata stays null and
    // the server has the final say, so this can only ever fail open.
    setSrcSize(await readVideoSize(file).catch(() => null));
    if (!uid) {
      setError("Still signing in — try again in a second.");
      return;
    }
    setError(null);
    setSrcUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
      const path = `${uid}/src/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("media")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const url = supabase.storage.from("media").getPublicUrl(path).data.publicUrl;
      setSrcVideoUrl(url);
      setSrcVideoName(file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setSrcUploading(false);
    }
  }

  /**
   * Raise the source clip past the swap model's floor, returning the new URL.
   *
   * Its own HTTP request rather than a step inside /api/swap: an upscale and a
   * Kling O1 edit are each minutes long, and running them back to back in one
   * 300s function is how the CloseBoss avatar renders used to 504 — taking the
   * reserved credits with them, since SIGKILL skips the refund. Two short
   * requests, chained here, stay well inside the ceiling while still being a
   * single click for the user.
   */
  async function upscaleNow(url: string): Promise<string> {
    const res = await fetch("/api/upscale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoUrl: url }),
    });
    const data = (await res.json()) as { url?: string; error?: string };
    if (!res.ok || !data.url) throw new Error(data.error || `Upscale failed (${res.status})`);
    return data.url;
  }

  async function runSwap() {
    if (loading) return;
    if (!srcVideoUrl) {
      setError("Add a source video — upload a clip or paste a direct video URL.");
      return;
    }
    const tooSmall = !!srcSize && srcSize.width > 0 && srcSize.width < MIN_SWAP_WIDTH;
    if (tooSmall && !upscaleFirst) {
      setError(
        `That clip is only ${srcSize!.width}px wide — swaps need at least ${MIN_SWAP_WIDTH}px. Tick “Upscale it first”, or re-export at a higher resolution.`,
      );
      return;
    }
    if (!refUrl) {
      setError("Add a reference image to swap in.");
      return;
    }
    setLoading(true);
    setError(null);
    setResults([]);
    try {
      // One click, two calls. If the upscale fails it throws here and the swap
      // is never submitted — so a failed prep can't burn the swap's credits too.
      let sourceUrl = srcVideoUrl;
      if (tooSmall && upscaleFirst) {
        setStage("upscaling");
        sourceUrl = await upscaleNow(srcVideoUrl);
        setSrcVideoUrl(sourceUrl);
        setSrcVideoName("upscaled clip");
        setSrcSize((s) => (s ? { width: s.width * 2, height: s.height * 2 } : null));
      }
      setStage("swapping");
      const res = await fetch("/api/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // `sourceUrl`, not `srcVideoUrl` — setSrcVideoUrl above does not update
          // the value captured by this closure, so reading state here would send
          // the original undersized clip and 422 immediately after paying to
          // upscale it.
          videoUrl: sourceUrl,
          imageUrl: refUrl,
          target: swapTarget,
          prompt: prompt.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { urls?: string[]; error?: string };
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      const urls = data.urls || [];
      setResults(urls);
      setResultMode("video");
      setResultAspect("16:9");
      setResultPrompt(prompt.trim() || `${swapTarget} swap`);
      if (urls.length) setModalOpen(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
      setStage(null);
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
      const urls = data.urls || [];
      setResults(urls);
      setResultMode(mode);
      setResultAspect(aspect);
      setResultPrompt(p);
      if (urls.length) setModalOpen(true);
      router.refresh();
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
      <section className="rounded-2xl border border-slate-200 bg-white p-4 backdrop-blur sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1 text-sm">
            {(["image", "video", "swap"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setActivePreset(null);
                }}
                className={`rounded-md px-4 py-1.5 font-medium capitalize transition ${
                  mode === m ? "bg-boss-violet text-white shadow" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {mode !== "swap" &&
            (hasRef ? (
              <div className="ml-1 flex items-center gap-2 rounded-lg border border-boss-gold/30 bg-boss-gold/10 py-1 pl-1 pr-2 text-xs">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={refUrl!} alt="reference" className="size-7 rounded object-cover" />
                <span className="text-slate-700">{mode === "video" ? "Source frame" : "Reference"}</span>
                <button onClick={() => setRefUrl(null)} className="text-slate-500 hover:text-slate-900" aria-label="remove reference">
                  ×
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="ml-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:text-slate-900 disabled:opacity-40"
              >
                {uploading ? "Uploading…" : "+ Reference image"}
              </button>
            ))}
          <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} className="hidden" />
          <input ref={videoRef} type="file" accept="video/*" onChange={onPickVideo} className="hidden" />
        </div>

        {mode === "swap" ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Replace a face, product, or background inside an existing clip — the original motion,
              lighting and camera stay put.
            </p>

            <div className="rounded-xl border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600">1 · Source video</span>
                {srcVideoUrl && (
                  <button
                    onClick={() => {
                      setSrcVideoUrl(null);
                      setSrcVideoName(null);
                    }}
                    className="text-xs text-slate-500 hover:text-slate-900"
                  >
                    Remove
                  </button>
                )}
              </div>
              {srcVideoUrl ? (
                <video src={srcVideoUrl} controls className="max-h-48 w-full rounded-lg bg-slate-100" />
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => videoRef.current?.click()}
                      disabled={srcUploading}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:text-slate-900 disabled:opacity-40"
                    >
                      {srcUploading ? "Uploading…" : "Upload a clip"}
                    </button>
                    <span className="text-xs text-slate-400">or paste a direct URL</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="url"
                      value={srcUrlText}
                      onChange={(e) => {
                        setSrcUrlText(e.target.value);
                        setSrcUrlError(null);
                      }}
                      onKeyDown={(e) => e.key === "Enter" && commitSrcUrl()}
                      placeholder="https://…/clip.mp4"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-boss-violet/60"
                    />
                    <button
                      onClick={commitSrcUrl}
                      disabled={!srcUrlText.trim()}
                      className="shrink-0 rounded-lg bg-boss-violet px-3 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
                    >
                      Use
                    </button>
                  </div>
                  {srcUrlError && <p className="text-[11px] text-red-600">{srcUrlError}</p>}
                  <p className="text-[11px] text-slate-400">
                    3–10s, 720p+, under 200MB. Must be a direct video file (.mp4/.mov) — not a
                    YouTube/TikTok page link.
                  </p>
                </div>
              )}
              {srcVideoName && (
                <p className="mt-1 text-[11px] text-slate-400">
                  {srcVideoName}
                  {srcSize && srcSize.width > 0 && ` · ${srcSize.width}×${srcSize.height}`}
                </p>
              )}
              {srcSize && srcSize.width > 0 && srcSize.width < MIN_SWAP_WIDTH && (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                  <p className="text-[11px] leading-relaxed text-amber-900">
                    This clip is {srcSize.width}px wide — swaps need at least {MIN_SWAP_WIDTH}px.
                  </p>
                  <label className="mt-2 flex cursor-pointer items-start gap-2 text-[11px] leading-relaxed text-amber-900">
                    <input
                      type="checkbox"
                      checked={upscaleFirst}
                      onChange={(e) => setUpscaleFirst(e.target.checked)}
                      disabled={loading}
                      className="mt-0.5 accent-amber-600"
                    />
                    <span>
                      Upscale to {srcSize.width * 2}×{srcSize.height * 2} first — runs automatically
                      when you hit Run swap (+{CREDIT_COST.upscale} credits, adds 1–2 min).
                    </span>
                  </label>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600">2 · Swap in this image</span>
                {refUrl && (
                  <button onClick={() => setRefUrl(null)} className="text-xs text-slate-500 hover:text-slate-900">
                    Remove
                  </button>
                )}
              </div>
              {refUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={refUrl} alt="reference" className="max-h-40 rounded-lg object-contain" />
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:text-slate-900 disabled:opacity-40"
                >
                  {uploading ? "Uploading…" : "Upload reference image"}
                </button>
              )}
            </div>

            <div>
              <span className="text-xs font-semibold text-slate-600">3 · What to replace</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {(
                  [
                    ["face", "🙂 Face"],
                    ["person", "🧍 Whole person"],
                    ["outfit", "👔 Outfit"],
                    ["product", "📦 Product"],
                    ["background", "🖼 Background"],
                  ] as [SwapTarget, string][]
                ).map(([t, label]) => (
                  <button
                    key={t}
                    onClick={() => setSwapTarget(t)}
                    aria-pressed={swapTarget === t}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      swapTarget === t
                        ? "border-boss-violet bg-boss-violet/10 text-boss-violet"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:border-boss-violet/50 hover:text-slate-900"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={2}
              placeholder="Optional: extra instructions (e.g. keep the sunglasses, match the warm lighting)…"
              className="w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-boss-violet/60 focus:ring-2 focus:ring-boss-violet/20"
            />

            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">
                {willUpscale
                  ? `Costs ${25 + CREDIT_COST.upscale} credits (incl. upscale) · ~2–5 min`
                  : "Costs 25 credits · ~1–3 min"}
              </span>
              <button
                onClick={runSwap}
                disabled={loading || !srcVideoUrl || !refUrl}
                className="ml-auto inline-flex items-center gap-2 rounded-xl bg-boss-gold px-5 py-2.5 text-sm font-semibold text-black transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading && <Spinner />}
                {stage === "upscaling"
                  ? "Upscaling… (1 of 2)"
                  : stage === "swapping"
                    ? willUpscale
                      ? "Swapping… (2 of 2)"
                      : "Swapping…"
                    : "Run swap"}
              </button>
            </div>
          </div>
        ) : (
          <>
        <textarea
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            setActivePreset(null);
          }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run();
          }}
          rows={4}
          placeholder={placeholder}
          className="w-full resize-y rounded-xl border border-slate-200 bg-white p-3.5 text-[15px] leading-relaxed text-slate-900 placeholder:text-slate-400 outline-none focus:border-boss-violet/60 focus:ring-2 focus:ring-boss-violet/20"
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!hasRef && (
            <>
              <span className="text-xs font-medium text-slate-400">Aspect</span>
              {ASPECTS.map((a) => (
                <button
                  key={a}
                  onClick={() => {
                    setAspect(a);
                    setActivePreset(null);
                  }}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ring-1 transition ${
                    aspect === a
                      ? "bg-boss-violet text-white ring-boss-violet"
                      : "bg-white text-slate-500 ring-slate-200 hover:text-slate-700"
                  }`}
                >
                  {a}
                </button>
              ))}
            </>
          )}
          {hasRef && mode === "image" && (
            <span className="text-xs text-slate-400">Editing your reference with nano-banana</span>
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

        {!hasRef && (
          <div className="mt-4">
            <span className="text-xs text-slate-400">Start from a preset:</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p.id)}
                  title={`${p.mode} · ${p.aspect}`}
                  aria-pressed={activePreset === p.id}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    activePreset === p.id
                      ? "border-boss-violet bg-boss-violet/10 text-boss-violet"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:border-boss-violet/50 hover:text-slate-900"
                  }`}
                >
                  <span aria-hidden>{p.emoji}</span>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}
          </>
        )}
      </section>

      {loading && (
        <p className="text-center text-sm text-slate-500">
          {mode === "swap"
            ? "Swapping in your reference — this usually takes 1–3 minutes."
            : mode === "video"
              ? "Rendering video — this usually takes 1–3 minutes."
              : hasRef
                ? "Editing your image…"
                : "Painting your image…"}
        </p>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-sm text-red-700">
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

      {results.length > 0 && !modalOpen && (
        <button
          onClick={() => setModalOpen(true)}
          className="mx-auto inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700 transition hover:text-slate-900"
        >
          ✓ Saved to your gallery · View result ↗
        </button>
      )}

      {modalOpen && results.length > 0 && (
        <ResultModal
          urls={results}
          mode={resultMode}
          aspect={resultAspect}
          defaultTitle={resultPrompt}
          brandName={brandName}
          youtubeEnabled={youtubeEnabled}
          youtubeConnected={youtubeConnected}
          youtubeChannel={youtubeChannel}
          social={social}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}

function ResultModal({
  urls,
  mode,
  aspect,
  defaultTitle,
  brandName,
  youtubeEnabled,
  youtubeConnected,
  youtubeChannel,
  social,
  onClose,
}: {
  urls: string[];
  mode: Mode;
  aspect: string;
  defaultTitle: string;
  brandName: string | null;
  youtubeEnabled: boolean;
  youtubeConnected: boolean;
  youtubeChannel: string | null;
  social?: SocialStatus;
  onClose: () => void;
}) {
  // The shown video can be replaced by a CTA-appended version in place.
  const [videoUrl, setVideoUrl] = useState(urls[0]);
  const [ctaAdded, setCtaAdded] = useState(false);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Generated result"
    >
      <div
        className="relative flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 grid size-8 place-items-center rounded-full bg-white/80 text-lg text-slate-700 transition hover:bg-white hover:text-slate-900"
        >
          ×
        </button>

        <div className="overflow-y-auto">
          {mode === "video" ? (
            <div className="bg-slate-100">
              <video key={videoUrl} src={videoUrl} controls autoPlay loop className="max-h-[60dvh] w-full" />
            </div>
          ) : (
            urls.map((url) => (
              <div key={url} className="bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="Generated marketing creative" className="max-h-[60dvh] w-full object-contain" />
              </div>
            ))
          )}

          {mode === "video" && (
            <CtaEndCard
              videoUrl={videoUrl}
              aspect={aspect}
              brandName={brandName}
              defaultTopic={defaultTitle}
              added={ctaAdded}
              onDone={(u) => {
                setVideoUrl(u);
                setCtaAdded(true);
              }}
            />
          )}

          {mode === "video" && youtubeEnabled && (
            <YoutubePublish
              url={videoUrl}
              defaultTitle={defaultTitle}
              connected={youtubeConnected}
              channel={youtubeChannel}
            />
          )}
          {mode === "image" && social && (
            <SocialPublish url={urls[0]} defaultCaption={defaultTitle} status={social} />
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm">
          <span className="text-slate-500">Saved to your gallery</span>
          <div className="flex items-center gap-2">
            <Link href="/studio/gallery" className="rounded-lg px-3 py-1.5 font-medium text-slate-600 transition hover:text-slate-900">
              Gallery
            </Link>
            <a
              href={mode === "video" ? videoUrl : urls[0]}
              download
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-boss-gold px-4 py-1.5 font-semibold text-black transition hover:brightness-105"
            >
              Download ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function CtaEndCard({
  videoUrl,
  aspect,
  brandName,
  defaultTopic,
  added,
  onDone,
}: {
  videoUrl: string;
  aspect: string;
  brandName: string | null;
  defaultTopic: string;
  added: boolean;
  onDone: (url: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<"brand" | "custom" | "ai">("brand");
  const [headline, setHeadline] = useState("");
  const [subline, setSubline] = useState(brandName ?? "");
  const [duration, setDuration] = useState(3);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/cta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoUrl,
          aspect,
          source,
          durationSec: duration,
          headline: headline.trim() || undefined,
          subline: subline.trim() || undefined,
          topic: defaultTopic,
        }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || `Failed (${res.status})`);
      onDone(data.url);
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't add the end card.");
    } finally {
      setBusy(false);
    }
  }

  if (added && !open) {
    return (
      <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-emerald-50 px-4 py-3 text-sm">
        <span className="text-emerald-700">CTA end card added ✓</span>
        <button onClick={() => setOpen(true)} className="text-xs font-medium text-slate-600 hover:text-slate-900">
          Redo
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900"
        >
          + Add CTA end card
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-600">CTA end card</span>
        <button onClick={() => setOpen(false)} className="text-xs text-slate-500 hover:text-slate-900">
          Cancel
        </button>
      </div>

      <div className="inline-flex w-fit rounded-lg border border-slate-200 bg-white p-1 text-xs">
        {(
          [
            ["brand", "Brand Kit"],
            ["custom", "Custom"],
            ["ai", "AI-written"],
          ] as [typeof source, string][]
        ).map(([s, label]) => (
          <button
            key={s}
            onClick={() => setSource(s)}
            className={`rounded-md px-3 py-1 font-medium transition ${
              source === s ? "bg-boss-violet text-white" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {source === "ai" ? (
        <p className="text-xs text-slate-500">
          Claude writes the CTA from your video&apos;s topic + Brand Kit voice. Leave the fields blank, or fill one to
          override.
        </p>
      ) : source === "brand" ? (
        <p className="text-xs text-slate-500">
          Uses your Brand Kit colours &amp; logo. Add a headline / contact line, or leave blank for a sensible default.
        </p>
      ) : null}

      <input
        value={headline}
        onChange={(e) => setHeadline(e.target.value)}
        maxLength={60}
        placeholder="Headline (e.g. Book a free consult)"
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-boss-violet/60"
      />
      <input
        value={subline}
        onChange={(e) => setSubline(e.target.value)}
        maxLength={90}
        placeholder="Contact line (phone · site · @handle)"
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-boss-violet/60"
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">Length</span>
        {[2, 3].map((d) => (
          <button
            key={d}
            onClick={() => setDuration(d)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ring-1 transition ${
              duration === d
                ? "bg-boss-violet text-white ring-boss-violet"
                : "bg-white text-slate-500 ring-slate-200 hover:text-slate-700"
            }`}
          >
            {d}s
          </button>
        ))}
        <span className="ml-2 text-xs text-slate-400">Costs 6 credits</span>
        <button
          onClick={add}
          disabled={busy}
          className="ml-auto inline-flex items-center gap-2 rounded-lg bg-boss-gold px-4 py-2 text-sm font-semibold text-black transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy && <Spinner />}
          {busy ? "Adding…" : "Add end card"}
        </button>
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}

function YoutubePublish({
  url,
  defaultTitle,
  connected,
  channel,
}: {
  url: string;
  defaultTitle: string;
  connected: boolean;
  channel: string | null;
}) {
  const [title, setTitle] = useState(defaultTitle.slice(0, 100));
  const [privacy, setPrivacy] = useState<"unlisted" | "public" | "private">("unlisted");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [published, setPublished] = useState<string | null>(null);
  const [needsConnect, setNeedsConnect] = useState(!connected);

  async function publish() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/youtube/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, title, privacy }),
      });
      const data = (await res.json()) as { url?: string; error?: string; needsConnect?: boolean };
      if (!res.ok) {
        if (data.needsConnect) setNeedsConnect(true);
        throw new Error(data.error || `Publish failed (${res.status})`);
      }
      setPublished(data.url || null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Publish failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
      {published ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-emerald-600">Published to YouTube ✓</span>
          <a
            href={published}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-boss-gold px-3 py-1.5 text-xs font-semibold text-black transition hover:brightness-105"
          >
            Watch on YouTube ↗
          </a>
        </div>
      ) : needsConnect ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-slate-600">Publish this clip straight to your YouTube channel.</span>
          <a
            href="/api/youtube/connect"
            className="whitespace-nowrap rounded-lg bg-[#FF0000] px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110"
          >
            Connect YouTube
          </a>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>▶ Publish to YouTube</span>
            {channel && <span className="text-slate-400">· {channel}</span>}
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            placeholder="Video title"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-boss-violet/60"
          />
          <div className="flex items-center gap-2">
            <select
              value={privacy}
              onChange={(e) => setPrivacy(e.target.value as "unlisted" | "public" | "private")}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none focus:border-boss-violet/60"
            >
              <option value="unlisted">Unlisted</option>
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
            <button
              onClick={publish}
              disabled={busy || !title.trim()}
              className="ml-auto inline-flex items-center gap-2 rounded-lg bg-[#FF0000] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy && <Spinner light />}
              {busy ? "Publishing…" : "Publish"}
            </button>
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
      )}
    </div>
  );
}

function Spinner({ light = false }: { light?: boolean }) {
  return (
    <span
      className={`size-4 animate-spin rounded-full border-2 ${
        light ? "border-white/40 border-t-white" : "border-black/30 border-t-black"
      }`}
      aria-hidden
    />
  );
}
