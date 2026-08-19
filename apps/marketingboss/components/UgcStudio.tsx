"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useDoneNotifier, NotifyChoice } from "@/components/NotifyWhenDone";

export type ChannelOption = { id: string; label: string; connected: boolean; connectPath: string };

type UgcAd = {
  hook: string;
  script: string;
  onScreen: string[];
  cta: string;
  hashtags: string[];
  videoPrompt: string;
};
type PubResult = { platform: string; ok: boolean; url?: string | null; error?: string };
type Ref = { url: string; kind: "image" | "video" };
/** Just enough of a Character to offer it as the ad's presenter. */
type CastMember = { id: string; name: string; role: string | null; reference_images: string[] | null };
type ViralRef = { title: string; platform: string; why: string; hook: string; styleNotes: string; url: string };

function withHashes(tags: string[]): string {
  return tags.map((h) => `#${h.replace(/^#/, "")}`).join(" ");
}
function parseHashtags(s: string): string[] {
  return s
    .split(/[\s,]+/)
    .map((h) => h.replace(/^#/, "").trim())
    .filter(Boolean);
}

export default function UgcStudio({
  channels,
  aiConfigured,
}: {
  channels: ChannelOption[];
  aiConfigured: boolean;
}) {
  const [supabase] = useState(() => createClient());
  const [uid, setUid] = useState<string | null>(null);

  const [intent, setIntent] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [ad, setAd] = useState<UgcAd | null>(null);

  /**
   * Remix: cast one of the user's Character Studio cast as the presenter, so
   * the ad is performed by a recurring model instead of whoever the video model
   * happens to invent. Distinct from the Studio's swap, which edits an existing
   * clip — nothing here is edited, the ad is generated with them in it.
   */
  const [cast, setCast] = useState<CastMember[]>([]);
  const [characterId, setCharacterId] = useState("");

  // Viral-reference finder (AI web search) + the chosen style to emulate.
  const [scouting, setScouting] = useState(false);
  const [viralRefs, setViralRefs] = useState<ViralRef[] | null>(null);
  const [chosenStyle, setChosenStyle] = useState<ViralRef | null>(null);

  // Editable ad fields
  const [script, setScript] = useState("");
  const [videoPrompt, setVideoPrompt] = useState("");
  const [caption, setCaption] = useState("");

  // References (guide the render — a still or a viral ad to emulate)
  const [refs, setRefs] = useState<Ref[]>([]);
  const [uploading, setUploading] = useState(false);
  /** What the browser is doing to a reference clip before it uploads, if anything. */
  const [prepping, setPrepping] = useState<string | null>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const vidRef = useRef<HTMLInputElement>(null);

  /**
   * Output length. Seedance 2.5 generates up to 30s in one shot; the platforms'
   * own guidance puts a UGC ad at 15-30s, so 20 is a better default than the
   * model's "auto" (which tended to come back far shorter than ad length).
   */
  const [seconds, setSeconds] = useState(20);
  /**
   * A cast character or an uploaded reference routes the render to Seedance 2.0
   * — 2.5 refuses face references outright — and 2.0 stops at 15s. Only a
   * text-only ad reaches 30s, so the picker must not offer lengths that would
   * be silently clamped.
   */
  const refBound = refs.length > 0 || !!characterId;
  const maxSeconds = refBound ? 15 : 30;
  const lengthChoices = [8, 12, 15, 20, 25, 30].filter((n) => n <= maxSeconds);
  // Casting someone AFTER picking 30s would leave the select holding a value it
  // no longer offers, and the server would quietly clamp it to something the
  // user never chose. Bring it down as soon as the ceiling drops.
  useEffect(() => {
    setSeconds((v) => (v > maxSeconds ? maxSeconds : v));
  }, [maxSeconds]);
  const [generating, setGenerating] = useState(false);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  /** Seedance renders run minutes — offer wait-or-notify. */
  const notifier = useDoneNotifier();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [publishMode, setPublishMode] = useState<"now" | "schedule">("now");
  const [scheduledFor, setScheduledFor] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [scheduled, setScheduled] = useState(false);
  const [results, setResults] = useState<PubResult[] | null>(null);

  const [error, setError] = useState<string | null>(null);
  const isCreditError = !!error && /credit/i.test(error);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null));
  }, [supabase]);

  // Load the cast so an ad can be performed by a recurring character. Silent on
  // failure: casting is optional, and a missing cast should not block writing.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/characters")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { characters?: CastMember[] } | null) => {
        if (!cancelled && d?.characters) setCast(d.characters);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  /** Only a character with a portrait can be cast — it IS the visual reference. */
  const castable = cast.filter((c) => (c.reference_images ?? []).length > 0);
  const presenter = castable.find((c) => c.id === characterId) ?? null;

  const fieldCls =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-boss-violet/60";
  const primaryBtn =
    "inline-flex items-center gap-2 rounded-xl bg-boss-gold px-5 py-2.5 text-sm font-semibold text-black transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40";
  const chipBtn =
    "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:text-slate-900 disabled:opacity-40";

  async function uploadFile(file: File, folder: string): Promise<string> {
    if (!uid) throw new Error("Still signing in — try again in a second.");
    const ext = (file.name.split(".").pop() || "bin").toLowerCase();
    const path = `${uid}/${folder}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("media").upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) throw upErr;
    return supabase.storage.from("media").getPublicUrl(path).data.publicUrl;
  }

  async function onPickRef(e: React.ChangeEvent<HTMLInputElement>, kind: "image" | "video") {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith(`${kind}/`)) return setError(`Please choose ${kind === "video" ? "a video" : "an image"} file.`);
    const have = refs.filter((r) => r.kind === kind).length;
    // References run on Seedance 2.0 (2.5 refuses face references), so 2.0's
    // 9-image / 3-video limits are the ones that apply.
    if (kind === "image" && have >= 9) return setError("Up to 9 reference images.");
    if (kind === "video" && have >= 3) return setError("Up to 3 reference videos.");
    setError(null);
    setUploading(true);
    try {
      let toUpload = file;
      // Seedance enforces the same 24-60fps window on reference clips that Kling
      // enforces on swap sources, and rejects them AFTER the upload. A 16.87fps
      // screen recording is a normal thing to have, so fix it here rather than
      // hand the user a failure minutes later.
      //
      // Deliberately in the browser: neither fal endpoint can change a frame
      // rate. Measured on a 30.11s/16.87fps clip, both returned 508 frames at
      // 16.87fps — video-upscaler (241s, resolution only) and ffmpeg-api compose.
      if (kind === "video") {
        const { readMp4Fps, conformClip } = await import("@/lib/trimClient");
        const fps = await readMp4Fps(file);
        if (fps !== null && (fps < 24 || fps > 60)) {
          setPrepping(`This clip runs at ${fps.toFixed(1)}fps — re-encoding at 30fps so the model accepts it…`);
          toUpload = await conformClip(file);
        }
      }
      const url = await uploadFile(toUpload, "ugc-refs");
      setRefs((prev) => [...prev, { url, kind }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setPrepping(null);
      setUploading(false);
    }
  }

  async function runInspire() {
    const i = intent.trim();
    if (!i || scouting) return;
    setScouting(true);
    setError(null);
    try {
      const res = await fetch("/api/compose/ugc/inspire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: i }),
      });
      const data = (await res.json()) as { refs?: ViralRef[]; error?: string };
      if (!res.ok || !data.refs) throw new Error(data.error || `Couldn't find references (${res.status})`);
      setViralRefs(data.refs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed.");
    } finally {
      setScouting(false);
    }
  }

  function styleHintFrom(v: ViralRef): string {
    return `"${v.title}" (${v.platform}). Hook style: ${v.hook}. Format to emulate: ${v.styleNotes}`;
  }

  async function runDraft() {
    const i = intent.trim();
    if (!i || drafting) return;
    setDrafting(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch("/api/compose/ugc/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: i,
          hasReference: refs.length > 0,
          styleHint: chosenStyle ? styleHintFrom(chosenStyle) : undefined,
          seconds,
          characterId: characterId || undefined,
        }),
      });
      const data = (await res.json()) as { ad?: UgcAd; error?: string };
      if (!res.ok || !data.ad) throw new Error(data.error || `Couldn't write the ad (${res.status})`);
      const a = data.ad;
      setAd(a);
      setScript(a.script);
      setVideoPrompt(a.videoPrompt);
      setCaption([a.hook, a.cta, withHashes(a.hashtags)].filter(Boolean).join("\n\n"));
      setClipUrl(null);
      setResults(null);
      setSelected(new Set(channels.filter((c) => c.connected).map((c) => c.id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setDrafting(false);
    }
  }

  async function generateClip() {
    const p = videoPrompt.trim();
    if (!p || generating) return;
    setGenerating(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch("/api/compose/ugc/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: p,
          aspect: "9:16",
          duration: seconds,
          characterId: characterId || undefined,
          imageUrls: refs.filter((r) => r.kind === "image").map((r) => r.url),
          videoUrls: refs.filter((r) => r.kind === "video").map((r) => r.url),
        }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || `Generation failed (${res.status})`);
      setClipUrl(data.url);
      notifier.fire("Your UGC ad is ready", "Open MarketingBoss to watch the clip.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Generation failed.";
      setError(msg);
      notifier.fire("Your UGC ad didn't finish", msg.slice(0, 140));
    } finally {
      setGenerating(false);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setResults(null);
  }

  function buildPosts() {
    return [...selected].map((platform) => ({ platform, caption: caption.trim() }));
  }

  async function publish() {
    const posts = buildPosts();
    if (publishing || !clipUrl || posts.length === 0) return;
    setPublishing(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch("/api/compose/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "video", url: clipUrl, title: ad?.hook, posts }),
      });
      const data = (await res.json()) as { results?: PubResult[]; error?: string };
      if (!res.ok) throw new Error(data.error || `Publish failed (${res.status})`);
      setResults(data.results || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publish failed.");
    } finally {
      setPublishing(false);
    }
  }

  async function schedule() {
    const posts = buildPosts();
    if (publishing || !clipUrl || posts.length === 0) return;
    if (!scheduledFor) return setError("Pick a date and time.");
    const when = new Date(scheduledFor);
    if (isNaN(when.getTime()) || when.getTime() < Date.now() + 60_000) {
      return setError("Pick a time at least a minute from now.");
    }
    setPublishing(true);
    setError(null);
    try {
      const res = await fetch("/api/compose/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "video",
          url: clipUrl,
          title: ad?.hook,
          caption: caption.trim(),
          hashtags: ad ? ad.hashtags : [],
          posts,
          scheduledFor: when.toISOString(),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || `Scheduling failed (${res.status})`);
      setScheduled(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scheduling failed.");
    } finally {
      setPublishing(false);
    }
  }

  if (!aiConfigured) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
        AI copywriting isn&apos;t turned on yet. Set <code className="text-boss-gold">ANTHROPIC_API_KEY</code> to enable UGC ads.
      </div>
    );
  }

  const imgCount = refs.filter((r) => r.kind === "image").length;
  const vidCount = refs.filter((r) => r.kind === "video").length;

  return (
    <div className="flex flex-col gap-5">
      {/* ── Step 1: the idea + references ─────────────────────────────── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h3 className="mb-1 text-base font-semibold text-slate-900">1 · What&apos;s the ad about?</h3>
        <p className="mb-3 text-xs text-slate-500">Describe the product and the angle. The AI writes a creator-style script and a shot list.</p>
        <textarea
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          rows={4}
          placeholder="e.g. A busy first-time homebuyer discovers our free AI home-search tool — casual, excited, 'you have to try this' energy."
          className="w-full resize-y rounded-xl border border-slate-200 bg-white p-3.5 text-[15px] leading-relaxed text-slate-900 placeholder:text-slate-400 outline-none focus:border-boss-violet/60"
        />

        {/* References */}
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Reference (optional):</span>
            <button onClick={() => imgRef.current?.click()} disabled={uploading} className={chipBtn}>
              {uploading ? "Uploading…" : "+ Image"}
            </button>
            <button onClick={() => vidRef.current?.click()} disabled={uploading} className={chipBtn}>
              {uploading ? (prepping ? "Preparing…" : "Uploading…") : "+ Video (a viral ad)"}
            </button>
            <span className="text-[11px] text-slate-400">Drop in a still or a clip to emulate its style, framing &amp; pacing.</span>
          </div>
          <input ref={imgRef} type="file" accept="image/*" onChange={(e) => onPickRef(e, "image")} className="hidden" />
          <input ref={vidRef} type="file" accept="video/*" onChange={(e) => onPickRef(e, "video")} className="hidden" />
          {refs.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {refs.map((r, idx) => (
                <span key={r.url} className="inline-flex items-center gap-2 rounded-lg border border-boss-gold/30 bg-boss-gold/10 py-1 pl-1 pr-2 text-xs">
                  {r.kind === "video" ? (
                    <video src={r.url} muted className="size-7 rounded object-cover" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.url} alt="reference" className="size-7 rounded object-cover" />
                  )}
                  <span className="text-slate-700">{r.kind === "video" ? "Video" : "Image"}</span>
                  <button
                    onClick={() => setRefs((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-slate-500 hover:text-slate-900"
                    aria-label="remove reference"
                  >
                    ×
                  </button>
                </span>
              ))}
              <span className="self-center text-[11px] text-slate-400">
                {imgCount}/9 images · {vidCount}/3 videos
              </span>
            </div>
          )}
          {prepping && (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] leading-relaxed text-amber-900">
              {prepping} The first one also downloads the encoder, so give it a moment.
            </p>
          )}
        </div>

        {/* Viral-reference finder */}
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={runInspire} disabled={scouting || !intent.trim()} className={chipBtn}>
              {scouting ? "Searching…" : "✨ Find a viral ad to emulate"}
            </button>
            <span className="text-[11px] text-slate-400">AI web-searches trending formats in your niche.</span>
          </div>
          {chosenStyle && (
            <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-boss-gold/30 bg-boss-gold/10 py-1 pl-2.5 pr-2 text-xs">
              <span className="text-slate-700">Emulating: <span className="font-medium text-slate-900">{chosenStyle.title}</span></span>
              <button onClick={() => setChosenStyle(null)} className="text-slate-500 hover:text-slate-900" aria-label="clear style">
                ×
              </button>
            </div>
          )}
          {scouting && <p className="mt-2 text-[11px] text-slate-400">Scanning what&apos;s trending — this takes ~20–40s.</p>}
          {viralRefs && viralRefs.length > 0 && (
            <div className="mt-2 flex flex-col gap-2">
              {viralRefs.map((v, i) => {
                const picked = chosenStyle?.title === v.title;
                return (
                  <div
                    key={i}
                    className={`rounded-lg border p-2.5 text-xs transition ${
                      picked ? "border-boss-gold/50 bg-boss-gold/5" : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">{v.title}</span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{v.platform}</span>
                      {v.url && (
                        <a href={v.url} target="_blank" rel="noreferrer" className="ml-auto text-boss-violet/80 underline underline-offset-2 hover:text-boss-violet">
                          example ↗
                        </a>
                      )}
                    </div>
                    <p className="mt-1 text-slate-600">{v.why}</p>
                    <p className="mt-1 text-slate-400">
                      <span className="text-slate-500">Hook:</span> {v.hook}
                    </p>
                    <button
                      onClick={() => setChosenStyle(picked ? null : v)}
                      className={`mt-2 rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                        picked ? "bg-boss-gold/20 text-boss-gold" : "border border-slate-200 text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {picked ? "✓ Emulating this" : "Use this style"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-end">
          <button onClick={runDraft} disabled={drafting || !intent.trim()} className={primaryBtn}>
            {drafting && <Spinner />}
            {drafting ? "Writing…" : ad ? "Rewrite ad" : "Write the ad"}
          </button>
        </div>
      </section>

      {/* ── Step 2: the ad + render ───────────────────────────────────── */}
      {ad && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <h3 className="mb-3 text-base font-semibold text-slate-900">2 · Review &amp; film</h3>

          <div className="mb-3 rounded-xl border border-boss-violet/20 bg-boss-violet/5 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-boss-violet/80">Hook</div>
            <p className="mt-0.5 text-sm text-slate-900">{ad.hook}</p>
            {ad.onScreen.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {ad.onScreen.map((line, i) => (
                  <span key={i} className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                    {line}
                  </span>
                ))}
              </div>
            )}
          </div>

          <Field label="Spoken script">
            <textarea value={script} onChange={(e) => setScript(e.target.value)} rows={4} className={`${fieldCls} resize-y leading-relaxed`} />
          </Field>
          <p className="mt-1 mb-3 text-[11px] text-slate-400">
            Seedance renders the creator + voice from the shot prompt below. Edit the script for your records; edit the prompt to change the render.
          </p>
          <Field label="Shot prompt (what gets filmed)">
            <textarea value={videoPrompt} onChange={(e) => setVideoPrompt(e.target.value)} rows={4} className={`${fieldCls} resize-y leading-relaxed`} />
          </Field>

          {castable.length > 0 && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <label className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                <span className="font-medium text-slate-700">Performed by</span>
                <select
                  value={characterId}
                  onChange={(e) => setCharacterId(e.target.value)}
                  disabled={generating || drafting}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 outline-none focus:border-boss-violet/60"
                >
                  <option value="">Anyone (the model invents a creator)</option>
                  {castable.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.role ? ` · ${c.role}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                {presenter
                  ? `${presenter.name}'s portrait guides the render and their description is written into the script, so they stay recognisable across ads. Add a reference clip above to remix its style with them in it.`
                  : "Cast someone from Character Studio to keep the same face across every ad, instead of a new stranger each time."}
              </p>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-[11px] text-slate-500">
              Length
              <select
                value={seconds}
                onChange={(e) => setSeconds(Number(e.target.value))}
                disabled={generating}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 outline-none focus:border-boss-violet/60"
              >
                {lengthChoices.map((n) => (
                  <option key={n} value={n}>
                    {n}s{n === 20 ? " · typical ad" : ""}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-[11px] text-slate-400">
              9:16 vertical · native voice · ~35 credits
              {refBound && " · max 15s with a reference"}
            </span>
            <button onClick={generateClip} disabled={generating || !videoPrompt.trim()} className={primaryBtn}>
              {generating && <Spinner />}
              {generating ? "Filming…" : clipUrl ? "Re-film" : "Film the ad"}
            </button>
          </div>
          <div className="mt-3">
            <NotifyChoice n={notifier} />
          </div>
          {generating && (
            <p className="mt-2 text-center text-xs text-slate-500">
              Filming with Seedance — this usually takes 1–3 minutes.{" "}
              {notifier.mode === "notify"
                ? "You can switch tabs; we'll notify you."
                : "Keep this tab open."}
            </p>
          )}

          {clipUrl && (
            <div className="mt-3 flex justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              <video src={clipUrl} controls loop className="max-h-[60dvh]" />
            </div>
          )}
        </section>
      )}

      {/* ── Step 3: publish ───────────────────────────────────────────── */}
      {ad && clipUrl && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <h3 className="mb-3 text-base font-semibold text-slate-900">3 · Post it</h3>
          {channels.length === 0 ? (
            <p className="text-sm text-slate-500">
              No video channels are set up yet.{" "}
              <Link href="/connections" className="text-boss-gold underline underline-offset-2">
                Connect TikTok or YouTube →
              </Link>
            </p>
          ) : (
            <>
              <Field label="Caption">
                <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={3} className={`${fieldCls} resize-y`} />
              </Field>
              <div className="mt-3 mb-3 flex flex-wrap gap-1.5">
                {channels.map((c) => {
                  if (!c.connected) {
                    return (
                      <a
                        key={c.id}
                        href={c.connectPath}
                        className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 transition hover:border-boss-violet/50 hover:text-slate-900"
                      >
                        Connect {c.label}
                      </a>
                    );
                  }
                  const on = selected.has(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggle(c.id)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        on ? "border-boss-gold/50 bg-boss-gold/15 text-boss-gold" : "border-slate-200 bg-slate-50 text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {on ? "✓ " : ""}
                      {c.label}
                    </button>
                  );
                })}
              </div>

              {scheduled ? (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-600">
                  Scheduled ✓ — it&apos;ll post automatically at your chosen time. Track it under{" "}
                  <Link href="/actions" className="font-semibold underline underline-offset-2">
                    Scheduled
                  </Link>
                  .
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1 text-sm">
                      {(["now", "schedule"] as const).map((m) => (
                        <button
                          key={m}
                          onClick={() => setPublishMode(m)}
                          className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                            publishMode === m ? "bg-boss-violet text-white shadow" : "text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          {m === "now" ? "Publish now" : "Schedule"}
                        </button>
                      ))}
                    </div>
                    {publishMode === "schedule" && (
                      <input
                        type="datetime-local"
                        value={scheduledFor}
                        onChange={(e) => setScheduledFor(e.target.value)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-boss-violet/60"
                      />
                    )}
                    <div className="ml-auto">
                      {publishMode === "now" ? (
                        <button onClick={publish} disabled={publishing || selected.size === 0} className={primaryBtn}>
                          {publishing && <Spinner />}
                          {publishing ? "Publishing…" : `Publish to ${selected.size || 0} channel${selected.size === 1 ? "" : "s"}`}
                        </button>
                      ) : (
                        <button onClick={schedule} disabled={publishing || selected.size === 0} className={primaryBtn}>
                          {publishing && <Spinner />}
                          {publishing ? "Scheduling…" : "Schedule post"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-sm text-red-600">
          {error}
          {isCreditError && (
            <Link href="/billing" className="ml-2 inline-block font-semibold text-boss-gold underline underline-offset-2 hover:brightness-110">
              Buy more credits →
            </Link>
          )}
        </div>
      )}

      {results && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="mb-2 text-sm font-semibold text-slate-900">Results</div>
          <ul className="space-y-1.5 text-sm">
            {results.map((r) => (
              <li key={r.platform} className={r.ok ? "text-emerald-600" : "text-red-600"}>
                <span className="font-medium">{channels.find((c) => c.id === r.platform)?.label ?? r.platform}</span>:{" "}
                {r.ok ? (
                  r.url ? (
                    <a href={r.url} target="_blank" rel="noreferrer" className="underline hover:brightness-110">
                      published ↗
                    </a>
                  ) : (
                    "published ✓"
                  )
                ) : (
                  r.error
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function Spinner() {
  return <span className="size-4 animate-spin rounded-full border-2 border-black/30 border-t-black" aria-hidden />;
}
