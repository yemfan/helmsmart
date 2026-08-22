"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import RemakeStudio from "@/components/RemakeStudio";
import { PRESETS } from "@/lib/presets";
import { CREDIT_COST } from "@/lib/creditCosts";
import { useDoneNotifier, NotifyChoice } from "@/components/NotifyWhenDone";
import SocialPublish, { type SocialStatus } from "@/components/SocialPublish";

type Mode = "image" | "video" | "swap" | "remake";
type SwapTarget = "face" | "person" | "outfit" | "product" | "background";
const ASPECTS = ["16:9", "9:16", "1:1", "4:3", "3:4"] as const;
type Aspect = (typeof ASPECTS)[number];

/**
 * The swap model's limits. Both are enforced by fal AFTER the upload and the
 * credit reservation, so every one of them is checked here first.
 */
const MIN_SWAP_WIDTH = 720;
/** fal reports "Maximum is 10.05 seconds"; 10 is the honest number to show. */
const MAX_SWAP_SECONDS = 10;
/**
 * What we actually ask the trimmer for. A stream copy cuts on a keyframe and so
 * lands slightly LONG (+0.13s measured), and a clip with sparse keyframes could
 * overshoot further. Aiming a second under the ceiling means a normal overshoot
 * still clears it, instead of failing the swap after the upload.
 */
const TRIM_TARGET_SECONDS = MAX_SWAP_SECONDS - 1;
/** Kling O1's frame-rate window. A 16.9fps screen capture is rejected outright. */
const MIN_SWAP_FPS = 24;
const MAX_SWAP_FPS = 60;
/** Mirrors TARGET_FPS in lib/trimClient — importing it would pull in the wasm chunk. */
const TARGET_FPS_UI = 30;

/** 75.5 -> "1:15" — seconds alone stop being readable past a minute. */
function formatClock(sec: number): string {
  const whole = Math.floor(sec);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
const MIN_SWAP_SECONDS = 3;
/**
 * The third limit the panel advertises ("under 200MB") and the last one that
 * was never checked. Unlike width and duration this one is knowable without
 * decoding anything — it is just file.size — and catching it here also saves
 * the pointless upload of a file the model will refuse.
 */
const MAX_SWAP_BYTES = 200 * 1024 * 1024;

type VideoMeta = { width: number; height: number; duration: number };

/**
 * Read a local video's dimensions AND duration without uploading it. Resolves
 * from `loadedmetadata`, which fires long before the file is fully buffered.
 * Rejects on anything the browser can't decode; callers treat that as unknown
 * and let the server decide rather than blocking a possibly-valid upload.
 */
function readVideoMeta(file: File): Promise<VideoMeta | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement("video");
    el.preload = "metadata";
    let timer: ReturnType<typeof setTimeout>;
    let settled = false;
    const finish = (v: VideoMeta | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(v);
    };
    // A source the browser cannot decode fires NEITHER loadedmetadata NOR
    // error — verified live in Chrome on 2026-08-18. Without this timeout the
    // promise never settles, and anything awaiting it stalls forever with no
    // error to show. Never resolve-or-hang; always resolve.
    timer = setTimeout(() => finish(null), 5000);
    el.onloadedmetadata = () =>
      finish({
        width: el.videoWidth,
        height: el.videoHeight,
        // Infinity/NaN on some streamed sources — 0 means "unknown", which
        // callers treat as "let the server decide".
        duration: Number.isFinite(el.duration) ? el.duration : 0,
      });
    el.onerror = () => finish(null);
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
  const [srcSize, setSrcSize] = useState<VideoMeta | null>(null);
  /** Tick to prepend an upscale pass to the swap, in one click. */
  const [upscaleFirst, setUpscaleFirst] = useState(true);
  /** Tick to cut an over-long clip down to the ceiling before swapping. */
  const [trimFirst, setTrimFirst] = useState(true);
  /** Where the kept section starts, in seconds. null until a clip is measured. */
  const [trimStart, setTrimStart] = useState<number | null>(null);
  /** The quietest stretch we found, kept so the UI can label the default. */
  const [quietStart, setQuietStart] = useState<number | null>(null);
  const [scanningAudio, setScanningAudio] = useState(false);
  /** Source frame rate, read from the MP4 header. null = couldn't tell. */
  const [srcFps, setSrcFps] = useState<number | null>(null);
  /** Tick to re-encode a clip whose frame rate is outside the model's window. */
  const [fixFps, setFixFps] = useState(true);
  /** Once the slider is touched, a later scan must not yank it back. */
  const startTouched = useRef(false);
  /**
   * The file the user picked, kept so an over-long clip can be trimmed locally
   * at Run-swap time. A pasted URL leaves this null — there is no local file to
   * cut, so trimming is simply not offered in that case.
   */
  const pickedFile = useRef<File | null>(null);
  /** Which leg of a chained run is in flight, for the button label. */
  const [stage, setStage] = useState<"trimming" | "upscaling" | "swapping" | null>(null);
  /**
   * Whether Run swap will chain an upscale pass first. Drives the cost line and
   * the step labels, so the extra credits are stated before the click, not after.
   */
  const willUpscale =
    upscaleFirst && !!srcSize && srcSize.width > 0 && srcSize.width < MIN_SWAP_WIDTH;
  /**
   * Too SHORT is a hard stop — there are no frames to invent. Too LONG is not:
   * ffmpeg.wasm can cut the picked file in the browser (see lib/trimClient).
   * Both are decided before the swap runs, not after fal has taken the credits
   * and three minutes.
   */
  const durationIssue: "long" | "short" | null =
    !srcSize || srcSize.duration <= 0
      ? null // unmeasurable — let the server have the final say
      : srcSize.duration > MAX_SWAP_SECONDS
        ? "long"
        : srcSize.duration < MIN_SWAP_SECONDS
          ? "short"
          : null;
  /**
   * Whether Run swap will cut the clip first. Needs the local file: the trim
   * happens in the browser, so a clip that arrived as a pasted URL can't use it.
   */
  /**
   * Frame rate is the fourth limit, after width, length and file size — and the
   * only one the app used to discover by letting fal refuse the upload.
   */
  const fpsIssue = srcFps !== null && (srcFps < MIN_SWAP_FPS || srcFps > MAX_SWAP_FPS);
  const canTrim = durationIssue === "long" && !!pickedFile.current;
  const willTrim = trimFirst && canTrim;
  /** A clip short enough to swap but at the wrong rate still needs a re-encode. */
  const canFixFps = fpsIssue && !!pickedFile.current && durationIssue !== "short";
  const willFixFpsOnly = !willTrim && fixFps && canFixFps;
  /** Either path re-encodes, and either one lands the clip at 30fps. */
  const willConform = willTrim || willFixFpsOnly;
  /** Latest start that still leaves a full section — the slider's upper bound. */
  const maxTrimStart = Math.max(0, (srcSize?.duration ?? 0) - TRIM_TARGET_SECONDS);
  const startAt = Math.min(trimStart ?? 0, maxTrimStart);
  /**
   * How many passes one click runs: trim and upscale are each optional prep,
   * the swap always happens. Counted rather than hardcoded — the labels used to
   * read "1 of 2" and would have started lying the moment trim was added.
   */
  const totalSteps = (willConform ? 1 : 0) + (willUpscale ? 1 : 0) + 1;
  const stepNumber =
    stage === "trimming" ? 1 : stage === "upscaling" ? (willConform ? 2 : 1) : totalSteps;
  /** " (2 of 3)" — omitted when the swap is the only pass. */
  const stepSuffix = totalSteps > 1 ? ` (${stepNumber} of ${totalSteps})` : "";
  /** Shared "wait here vs notify me" control — see components/NotifyWhenDone. */
  const notifier = useDoneNotifier();
  /**
   * Why Run swap is unavailable, in the user's words. A disabled button that
   * explains nothing is the worst of both worlds — it refuses and leaves you
   * guessing, which is exactly what happened here: the cost line reads
   * "30 credits (incl. upscale)" as soon as the clip is MEASURED, but the
   * button needs it UPLOADED, and those are seconds apart on a big file.
   *
   * Ordered by what the user would fix first.
   */
  const blockedReason: string | null = loading
    ? null // the button label already says what is happening
    : srcUploading
      ? "Uploading your clip…"
      : !srcVideoUrl
        ? "Add a source video to get started."
        : durationIssue === "long" && !willTrim
          ? canTrim
            ? `Clip is ${srcSize!.duration.toFixed(1)}s — tick “Trim it first”, or cut it to ${MIN_SWAP_SECONDS}–${MAX_SWAP_SECONDS}s.`
            : `Clip is ${srcSize!.duration.toFixed(1)}s — upload a ${MIN_SWAP_SECONDS}–${MAX_SWAP_SECONDS}s file so it can be trimmed here.`
          : durationIssue === "short"
            ? `Clip is ${srcSize!.duration.toFixed(1)}s — needs at least ${MIN_SWAP_SECONDS}s.`
            : fpsIssue && !willConform
              ? canFixFps
                ? `Clip is ${srcFps!.toFixed(1)}fps — tick “Fix the frame rate”.`
                : `Clip is ${srcFps!.toFixed(1)}fps — swaps need ${MIN_SWAP_FPS}–${MAX_SWAP_FPS}fps.`
              : !refUrl
              ? "Add a reference image to swap in."
              : null;
  /**
   * Suggest the quietest stretch as the default section.
   *
   * A swap has to invent lip movement, and the seam shows most while someone is
   * talking — so the section with no speech in it is usually the better one to
   * hand the model. Advisory only: it seeds the slider, never overrides a
   * choice, and a failure just leaves the opening selected.
   */
  useEffect(() => {
    if (durationIssue !== "long" || !pickedFile.current || !srcSize) return;
    if (startTouched.current) return;
    let cancelled = false;
    setScanningAudio(true);
    (async () => {
      try {
        const { findQuietestStart } = await import("@/lib/trimClient");
        const at = await findQuietestStart(pickedFile.current!, TRIM_TARGET_SECONDS, srcSize.duration);
        if (cancelled || startTouched.current) return;
        setQuietStart(at);
        setTrimStart(at);
      } catch {
        if (!cancelled) setTrimStart((v) => v ?? 0);
      } finally {
        if (!cancelled) setScanningAudio(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [durationIssue, srcSize]);

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
    // Checked before the upload starts, not after: a 200MB+ file would spend
    // minutes going to Storage only to be refused by the model afterwards.
    if (file.size > MAX_SWAP_BYTES) {
      const mb = Math.round(file.size / (1024 * 1024));
      setError(
        `That file is ${mb}MB — swaps take clips under 200MB. A ${MIN_SWAP_SECONDS}–${MAX_SWAP_SECONDS}s export is normally far smaller.`,
      );
      return;
    }
    // Measure ALONGSIDE the upload, never in front of it.
    //
    // This used to be `setSrcSize(await readVideoMeta(file))`, which made the
    // upload wait on a promise that can hang forever (see readVideoMeta). The
    // result, reproduced live: pick a clip, the input clears, and absolutely
    // nothing happens — no video, no spinner, no error. Measurement is only
    // advisory (it decides which warnings to show), so it must never sit on
    // the critical path.
    setSrcSize(null);
    pickedFile.current = file;
    startTouched.current = false;
    setTrimStart(null);
    setQuietStart(null);
    // Header-only read, so this costs a couple of MB and no wasm download.
    setSrcFps(null);
    void import("@/lib/trimClient")
      .then((m) => m.readMp4Fps(file))
      .then(setSrcFps)
      .catch(() => setSrcFps(null));
    void readVideoMeta(file).then(setSrcSize);
    if (!uid) {
      setError("Still signing in — try again in a second.");
      return;
    }
    setError(null);
    setSrcUploading(true);
    try {
      const url = await uploadSource(file);
      setSrcVideoUrl(url);
      setSrcVideoName(file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setSrcUploading(false);
    }
  }

  /** Put a source clip in Storage and hand back its public URL. */
  async function uploadSource(file: File): Promise<string> {
    const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
    const path = `${uid}/src/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("media")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) throw upErr;
    return supabase.storage.from("media").getPublicUrl(path).data.publicUrl;
  }

  /**
   * Cut the picked clip to the model's ceiling, in the browser, and upload the
   * result. Returns the new URL and the measured length.
   *
   * The cut is re-MEASURED rather than assumed: a stream copy lands on a
   * keyframe, so the output is at or just under the request, and "just under"
   * is exactly what keeps us inside the ceiling. If it somehow comes back long
   * we stop here rather than pay fal to reject it.
   */
  /**
   * Re-encode the picked clip into something the model accepts — optionally
   * keeping only a section — and upload the result.
   *
   * The output is re-MEASURED, and an unmeasurable one is treated as a failure
   * rather than waved through. That leniency is exactly how a 12.47s clip
   * reached fal after a 9s request: the check was `if (meta && ...)`, so a
   * measurement that returned null skipped it entirely.
   */
  async function conformNow(
    file: File,
    opts: { startSec?: number; seconds?: number },
  ): Promise<{ url: string; meta: VideoMeta }> {
    const { conformClip } = await import("@/lib/trimClient");
    const out = await conformClip(file, opts);
    const meta = await readVideoMeta(out);
    if (!meta || meta.duration <= 0) {
      throw new Error(
        "Couldn't confirm the prepared clip's length, so it wasn't sent. Try a different file.",
      );
    }
    if (meta.duration > MAX_SWAP_SECONDS) {
      throw new Error(
        `Preparing the clip produced ${meta.duration.toFixed(1)}s, over the ${MAX_SWAP_SECONDS}s limit. Pick a shorter section, or cut it before uploading.`,
      );
    }
    const url = await uploadSource(out);
    return { url, meta };
  }

  /**
   * Raise the source clip past the swap model's floor, returning the new URL.
   *
   * Its own HTTP request rather than a step inside /api/swap: an upscale and a
   * Kling O1 edit are each minutes long, and running them back to back in one
   * 300s function is how the CloseBoss avatar renders used to 504 — taking the
   * reserved credits with them, since SIGKILL skips the refund.
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
    if (durationIssue === "long" && !willTrim) {
      setError(
        canTrim
          ? `That clip is ${srcSize!.duration.toFixed(1)}s — swaps take at most ${MAX_SWAP_SECONDS}s. Tick “Trim it first”, or cut it to a ${MIN_SWAP_SECONDS}–${MAX_SWAP_SECONDS}s section and upload again.`
          : `That clip is ${srcSize!.duration.toFixed(1)}s — swaps take at most ${MAX_SWAP_SECONDS}s. Trimming runs on the file itself, so upload a ${MIN_SWAP_SECONDS}–${MAX_SWAP_SECONDS}s clip instead of a link.`,
      );
      return;
    }
    if (durationIssue === "short") {
      setError(
        `That clip is only ${srcSize!.duration.toFixed(1)}s — swaps need at least ${MIN_SWAP_SECONDS}s to work with.`,
      );
      return;
    }
    if (fpsIssue && !willConform) {
      setError(
        canFixFps
          ? `That clip is ${srcFps!.toFixed(1)}fps — swaps need ${MIN_SWAP_FPS}–${MAX_SWAP_FPS}fps. Tick “Fix the frame rate” and it will be re-encoded for you.`
          : `That clip is ${srcFps!.toFixed(1)}fps — swaps need ${MIN_SWAP_FPS}–${MAX_SWAP_FPS}fps. Re-export it at 30fps and upload again.`,
      );
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
      // Trim BEFORE upscaling: the upscaler then walks 10s of frames instead of
      // 30, which is faster and further from the function's time ceiling.
      if (willConform && pickedFile.current) {
        setStage("trimming");
        const cut = await conformNow(
          pickedFile.current,
          willTrim ? { startSec: startAt, seconds: TRIM_TARGET_SECONDS } : {},
        );
        sourceUrl = cut.url;
        setSrcVideoUrl(cut.url);
        setSrcVideoName(
          willTrim
            ? startAt > 0
              ? `${TRIM_TARGET_SECONDS}s from ${formatClock(startAt)}`
              : `first ${TRIM_TARGET_SECONDS}s`
            : "re-encoded at 30fps",
        );
        setSrcSize(cut.meta);
        setSrcFps(TARGET_FPS_UI);
      }
      if (tooSmall && upscaleFirst) {
        setStage("upscaling");
        sourceUrl = await upscaleNow(sourceUrl);
        setSrcVideoUrl(sourceUrl);
        setSrcVideoName("upscaled clip");
        setSrcSize((s) => (s ? { ...s, width: s.width * 2, height: s.height * 2 } : null));
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
      notifier.fire("Your swap is ready", "Open MarketingBoss to see the finished clip.");
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setError(msg);
      // Notify on failure too — a silent failure while they're in another tab
      // means they come back to a spinner that stopped, with no idea when.
      notifier.fire("Your swap didn't finish", msg.slice(0, 140));
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
      notifier.fire(
        mode === "video" ? "Your video is ready" : "Your image is ready",
        "Open MarketingBoss to see it.",
      );
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setError(msg);
      notifier.fire(mode === "video" ? "Your video didn't finish" : "Your image didn't finish", msg.slice(0, 140));
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
            {(["image", "video", "swap", "remake"] as Mode[]).map((m) => (
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

          {mode !== "swap" && mode !== "remake" &&
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

        {mode === "remake" ? (<RemakeStudio />) : mode === "swap" ? (
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
                  {srcSize && srcSize.duration > 0 && ` · ${srcSize.duration.toFixed(1)}s`}
                  {srcFps !== null && ` · ${srcFps.toFixed(1)}fps`}
                </p>
              )}
              {durationIssue === "long" && (
                <div
                  className={`mt-2 rounded-lg border p-2.5 ${
                    canTrim ? "border-amber-200 bg-amber-50" : "border-rose-200 bg-rose-50"
                  }`}
                >
                  <p
                    className={`text-[11px] leading-relaxed ${
                      canTrim ? "text-amber-900" : "text-rose-900"
                    }`}
                  >
                    This clip is {srcSize!.duration.toFixed(1)}s — swaps take at most{" "}
                    {MAX_SWAP_SECONDS}s.
                  </p>
                  {canTrim ? (
                    <>
                      <label className="mt-2 flex cursor-pointer items-start gap-2 text-[11px] leading-relaxed text-amber-900">
                        <input
                          type="checkbox"
                          checked={trimFirst}
                          onChange={(e) => setTrimFirst(e.target.checked)}
                          disabled={loading}
                          className="mt-0.5 accent-amber-600"
                        />
                        <span>
                          Trim to a {TRIM_TARGET_SECONDS}s section — runs automatically when you
                          hit Run swap (free, adds a few seconds).
                        </span>
                      </label>
                      {trimFirst && (
                        <div className="mt-2 pl-5">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-amber-900">Start at</span>
                            <input
                              type="range"
                              min={0}
                              max={Math.max(maxTrimStart, 0.25)}
                              step={0.25}
                              value={startAt}
                              onChange={(e) => {
                                startTouched.current = true;
                                setTrimStart(Number(e.target.value));
                              }}
                              disabled={loading}
                              aria-label="Section start time"
                              className="h-1 flex-1 accent-amber-600"
                            />
                            <span className="w-24 shrink-0 text-right text-[11px] font-medium tabular-nums text-amber-900">
                              {formatClock(startAt)}–{formatClock(startAt + TRIM_TARGET_SECONDS)}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] leading-relaxed text-amber-800">
                            {scanningAudio
                              ? "Looking for the quietest stretch…"
                              : quietStart !== null && startAt === quietStart
                                ? "Suggested: the quietest stretch, where nobody is talking — swaps look cleaner without lip movement to match. Drag to pick a different section."
                                : "Drag to pick the section you want."}
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="mt-1.5 text-[11px] leading-relaxed text-rose-900">
                      Trimming runs on the file itself, so it isn&rsquo;t available for a pasted
                      link. Upload a {MIN_SWAP_SECONDS}–{MAX_SWAP_SECONDS}s clip instead.
                    </p>
                  )}
                </div>
              )}
              {durationIssue === "short" && (
                <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5">
                  <p className="text-[11px] leading-relaxed text-rose-900">
                    This clip is only {srcSize!.duration.toFixed(1)}s — swaps need at least{" "}
                    {MIN_SWAP_SECONDS}s to work with.
                  </p>
                </div>
              )}
              {fpsIssue && (
                <div
                  className={`mt-2 rounded-lg border p-2.5 ${
                    canFixFps ? "border-amber-200 bg-amber-50" : "border-rose-200 bg-rose-50"
                  }`}
                >
                  <p
                    className={`text-[11px] leading-relaxed ${
                      canFixFps ? "text-amber-900" : "text-rose-900"
                    }`}
                  >
                    This clip runs at {srcFps!.toFixed(1)}fps — swaps need {MIN_SWAP_FPS}–
                    {MAX_SWAP_FPS}fps.
                  </p>
                  {canFixFps ? (
                    willTrim ? (
                      <p className="mt-1.5 text-[11px] leading-relaxed text-amber-900">
                        Trimming re-encodes the clip anyway, so the frame rate is fixed in the same
                        pass — nothing else to tick.
                      </p>
                    ) : (
                      <label className="mt-2 flex cursor-pointer items-start gap-2 text-[11px] leading-relaxed text-amber-900">
                        <input
                          type="checkbox"
                          checked={fixFps}
                          onChange={(e) => setFixFps(e.target.checked)}
                          disabled={loading}
                          className="mt-0.5 accent-amber-600"
                        />
                        <span>
                          Re-encode at {TARGET_FPS_UI}fps — runs automatically when you hit Run
                          swap (free, adds a few seconds).
                        </span>
                      </label>
                    )
                  ) : (
                    <p className="mt-1.5 text-[11px] leading-relaxed text-rose-900">
                      Re-encoding runs on the file itself, so it isn&rsquo;t available for a pasted
                      link. Re-export at {TARGET_FPS_UI}fps and upload the file.
                    </p>
                  )}
                </div>
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

            <NotifyChoice n={notifier} />

            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">
                {willUpscale
                  ? `Costs ${25 + CREDIT_COST.upscale} credits (incl. upscale) · ~2–5 min`
                  : "Costs 25 credits · ~1–3 min"}
                {willConform && " · preparing the clip is free"}
              </span>
              {blockedReason && (
                <span className="text-xs font-medium text-amber-700">{blockedReason}</span>
              )}
              <button
                onClick={runSwap}
                // Single source of truth with the message beside it — the button
                // is disabled exactly when there is a reason to show, so the two
                // can never disagree. (Width is deliberately NOT a blocker: it
                // has an upscale to offer instead.)
                disabled={loading || !!blockedReason}
                className="ml-auto inline-flex items-center gap-2 rounded-xl bg-boss-gold px-5 py-2.5 text-sm font-semibold text-black transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading && <Spinner />}
                {stage === "trimming"
                  ? `Trimming…${stepSuffix}`
                  : stage === "upscaling"
                    ? `Upscaling…${stepSuffix}`
                    : stage === "swapping"
                      ? `Swapping…${stepSuffix}`
                      : "Run swap"}
              </button>
            </div>
            {loading && (
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                {stage === "trimming"
                  ? `${willTrim ? `Cutting ${TRIM_TARGET_SECONDS}s from ${formatClock(startAt)}` : `Re-encoding at ${TARGET_FPS_UI}fps`}${stepSuffix} — the first run also downloads the encoder, so give it a moment.`
                  : stage === "upscaling"
                    ? `Upscaling to ${srcSize ? `${srcSize.width * 2}×${srcSize.height * 2}` : "720p+"}${stepSuffix} — about a minute.`
                    : `Swapping in your reference${stepSuffix} — usually 1–3 minutes.`}{" "}
                {notifier.mode === "notify"
                  ? "You can switch tabs — we'll notify you when it's done."
                  : "Keep this tab open; the result appears here."}
              </p>
            )}
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

        {/* Video renders run minutes; images come back in seconds, so the
            wait/notify choice would be noise there. */}
        {mode === "video" && (
          <div className="mt-3">
            <NotifyChoice n={notifier} />
          </div>
        )}

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

      {/* Swap has its own stage-aware line inside the panel — this one said
          "Swapping in your reference" while the button read "Upscaling… (1 of 2)". */}
      {loading && mode !== "swap" && mode !== "remake" && (
        <p className="text-center text-sm text-slate-500">
          {mode === "video"
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
