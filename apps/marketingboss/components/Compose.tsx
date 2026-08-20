"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useDoneNotifier, NotifyChoice } from "@/components/NotifyWhenDone";

type PostType = "text" | "image" | "video";
type Draft = {
  title: string;
  caption: string;
  cta: string;
  hashtags: string[];
  imagePrompt: string;
  videoPrompt: string;
};
type PlatformCaption = { platform: string; caption: string };
type PubResult = { platform: string; ok: boolean; url?: string | null; error?: string };
type GalleryItem = { url: string; type: string };

export type ComposeStatus = {
  /** provider key (meta/threads/linkedin/pinterest) → OAuth app configured */
  providersConfigured: Record<string, boolean>;
  /** platform → connected */
  connected: Record<string, boolean>;
  /** platform → account label */
  accountName: Record<string, string | null>;
  youtubeEnabled: boolean;
  youtubeConnected: boolean;
  youtubeChannel: string | null;
  aiConfigured: boolean;
};

const ASPECTS = ["16:9", "9:16", "1:1", "4:3", "3:4"] as const;
type Aspect = (typeof ASPECTS)[number];

const PLATFORM_META: Record<string, { label: string; provider: string; connectPath: string }> = {
  facebook: { label: "Facebook", provider: "meta", connectPath: "/api/social/connect/meta" },
  instagram: { label: "Instagram", provider: "meta", connectPath: "/api/social/connect/meta" },
  threads: { label: "Threads", provider: "threads", connectPath: "/api/social/connect/threads" },
  linkedin: { label: "LinkedIn", provider: "linkedin", connectPath: "/api/social/connect/linkedin" },
  pinterest: { label: "Pinterest", provider: "pinterest", connectPath: "/api/social/connect/pinterest" },
  youtube: { label: "YouTube", provider: "youtube", connectPath: "/api/youtube/connect" },
  tiktok: { label: "TikTok", provider: "tiktok", connectPath: "/api/social/connect/tiktok" },
};

// Which platforms can carry each post type.
const ELIGIBLE: Record<PostType, string[]> = {
  text: ["facebook", "threads", "linkedin"],
  image: ["facebook", "instagram", "threads", "linkedin", "pinterest"],
  video: ["youtube", "tiktok"],
};

const TYPES: { id: PostType; label: string; emoji: string; hint: string }[] = [
  { id: "text", label: "Text only", emoji: "✍️", hint: "Just words — Facebook, Threads, LinkedIn." },
  { id: "image", label: "Image", emoji: "🖼️", hint: "AI writes it and paints the picture." },
  { id: "video", label: "Video", emoji: "🎬", hint: "AI writes it and films the clip (YouTube)." },
];

type StepId = "idea" | "copy" | "media" | "publish";
const STEP_LABEL: Record<StepId, string> = { idea: "Idea", copy: "Copy", media: "Media", publish: "Publish" };

function parseHashtags(s: string): string[] {
  return s
    .split(/[\s,]+/)
    .map((h) => h.replace(/^#/, "").trim())
    .filter(Boolean);
}

export default function Compose({
  status,
  initialIntent,
  initialType,
}: {
  status: ComposeStatus;
  /** Prefill from an accepted Opportunity (?intent= / ?type= on /actions/new). */
  initialIntent?: string;
  initialType?: PostType;
}) {
  const [supabase] = useState(() => createClient());
  const [uid, setUid] = useState<string | null>(null);

  const [type, setType] = useState<PostType>(initialType ?? "image");
  const [intent, setIntent] = useState(initialIntent ?? "");
  const [drafting, setDrafting] = useState(false);

  const [hasDraft, setHasDraft] = useState(false);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  /**
   * Voiceover for a generated clip. Kling renders silent video, so anything made
   * outside the UGC studio has no voice until it is narrated here.
   */
  const [voiceScript, setVoiceScript] = useState("");
  const [voicing, setVoicing] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [cta, setCta] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [link, setLink] = useState("");
  const [mediaPrompt, setMediaPrompt] = useState("");

  const [aspect, setAspect] = useState<Aspect>("1:1");
  const [generating, setGenerating] = useState(false);
  /** Video renders run minutes — offer wait-or-notify (images are seconds). */
  const notifier = useDoneNotifier();
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);

  // Reference image (guides generation) + own-media upload/gallery.
  const [refUrl, setRefUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const refFileRef = useRef<HTMLInputElement>(null);
  const mediaFileRef = useRef<HTMLInputElement>(null);
  const [gallery, setGallery] = useState<null | { mode: "ref" | "media"; loading: boolean; items: GalleryItem[] }>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewing, setPreviewing] = useState(false);
  const [previews, setPreviews] = useState<PlatformCaption[] | null>(null);

  const [publishing, setPublishing] = useState(false);
  const [results, setResults] = useState<PubResult[] | null>(null);
  const [publishMode, setPublishMode] = useState<"now" | "schedule">("now");
  const [scheduledFor, setScheduledFor] = useState("");
  const [scheduled, setScheduled] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const isCreditError = !!error && /credit/i.test(error);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null));
  }, [supabase]);

  const needsMedia = type !== "text";
  const steps: StepId[] = needsMedia ? ["idea", "copy", "media", "publish"] : ["idea", "copy", "publish"];
  const step = steps[Math.min(stepIdx, steps.length - 1)];
  const mediaReady = !needsMedia || !!mediaUrl;

  const eligible = ELIGIBLE[type];
  const configuredEligible = useMemo(
    () =>
      eligible.filter((p) =>
        PLATFORM_META[p].provider === "youtube" ? status.youtubeEnabled : status.providersConfigured[PLATFORM_META[p].provider],
      ),
    [eligible, status],
  );

  function isConnected(p: string): boolean {
    return PLATFORM_META[p].provider === "youtube" ? status.youtubeConnected : !!status.connected[p];
  }
  function accountFor(p: string): string | null {
    return PLATFORM_META[p].provider === "youtube" ? status.youtubeChannel : status.accountName[p] ?? null;
  }

  function unlocked(id: StepId): boolean {
    if (id === "idea") return true;
    if (id === "copy" || id === "media") return hasDraft;
    return hasDraft && mediaReady; // publish
  }
  function goTo(id: StepId) {
    if (!unlocked(id)) return;
    const i = steps.indexOf(id);
    if (i >= 0) setStepIdx(i);
  }
  function back() {
    setStepIdx((i) => Math.max(0, i - 1));
  }

  function pickType(t: PostType) {
    if (t === type) return;
    setType(t);
    setAspect(t === "video" ? "16:9" : "1:1");
    setHasDraft(false);
    setMediaUrl(null);
    setRefUrl(null);
    setSelected(new Set());
    setPreviews(null);
    setResults(null);
    setError(null);
    setStepIdx(0);
  }

  async function runDraft() {
    const i = intent.trim();
    if (!i || drafting) return;
    setDrafting(true);
    setError(null);
    setMediaUrl(null);
    setPreviews(null);
    setResults(null);
    try {
      const res = await fetch("/api/compose/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: i, type }),
      });
      const data = (await res.json()) as { draft?: Draft; link?: string | null; error?: string };
      if (!res.ok || !data.draft) throw new Error(data.error || `Draft failed (${res.status})`);
      const d = data.draft;
      setTitle(d.title);
      setCaption(d.caption);
      setCta(d.cta);
      // Prefill the CTA link from the Brand Kit's company_url. Still editable —
      // and still blank if no brand URL is set, since a wrong link is worse
      // than none.
      if (data.link) setLink(data.link);
      setHashtags((d.hashtags || []).map((h) => `#${h.replace(/^#/, "")}`).join(" "));
      setMediaPrompt(type === "image" ? d.imagePrompt : type === "video" ? d.videoPrompt : "");
      setHasDraft(true);
      setSelected(new Set(eligible.filter((p) => isConnected(p))));
      setStepIdx(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setDrafting(false);
    }
  }

  async function generateMedia() {
    const p = mediaPrompt.trim();
    if (!p || generating) return;
    setGenerating(true);
    setError(null);
    setPreviews(null);
    setResults(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, prompt: p, aspect, imageUrl: refUrl || undefined }),
      });
      const data = (await res.json()) as { urls?: string[]; error?: string };
      if (!res.ok) throw new Error(data.error || `Generation failed (${res.status})`);
      setMediaUrl((data.urls || [])[0] ?? null);
      if (type === "video") notifier.fire("Your video is ready", "Open MarketingBoss to review and publish it.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Generation failed.";
      setError(msg);
      if (type === "video") notifier.fire("Your video didn't finish", msg.slice(0, 140));
    } finally {
      setGenerating(false);
    }
  }

  // Upload a file straight to Storage (browser → Supabase, bypassing Vercel's body cap).
  async function uploadFile(file: File, folder: string): Promise<string> {
    if (!uid) throw new Error("Still signing in — try again in a second.");
    const ext = (file.name.split(".").pop() || "bin").toLowerCase();
    const path = `${uid}/${folder}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("media").upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) throw upErr;
    return supabase.storage.from("media").getPublicUrl(path).data.publicUrl;
  }

  async function onPickRef(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Reference must be an image.");
    setError(null);
    setUploading(true);
    try {
      setRefUrl(await uploadFile(file, "refs"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  /** Narrate the current clip and replace it with the voiced version. */
  async function runVoiceover() {
    const script = voiceScript.trim();
    if (!mediaUrl || !script || voicing) return;
    setVoicing(true);
    setError(null);
    try {
      const res = await fetch("/api/voiceover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl: mediaUrl, script }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || `Narration failed (${res.status})`);
      // The narrated clip becomes the post's media; the silent one stays in the
      // gallery, so a bad read is recoverable without regenerating the video.
      setMediaUrl(data.url);
      setVoiceOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Narration failed.");
    } finally {
      setVoicing(false);
    }
  }

  async function onPickOwnMedia(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const want = type === "video" ? "video/" : "image/";
    if (!file.type.startsWith(want)) return setError(`Please choose ${type === "video" ? "a video" : "an image"} file.`);
    setError(null);
    setUploading(true);
    try {
      setMediaUrl(await uploadFile(file, "uploads"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function openGallery(mode: "ref" | "media") {
    setError(null);
    setGallery({ mode, loading: true, items: [] });
    // Reference is always an image; own-media matches the post type. RLS scopes rows to the owner.
    const want = mode === "ref" ? "image" : type;
    const { data } = await supabase
      .from("generations")
      .select("media_url,type")
      .eq("type", want)
      .order("created_at", { ascending: false })
      .limit(36);
    const items = ((data as { media_url: string; type: string }[]) ?? []).map((r) => ({ url: r.media_url, type: r.type }));
    setGallery({ mode, loading: false, items });
  }

  function pickFromGallery(url: string) {
    if (gallery?.mode === "ref") setRefUrl(url);
    else setMediaUrl(url);
    setGallery(null);
  }

  function toggle(p: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
    setPreviews(null);
    setResults(null);
  }

  async function runPreview() {
    if (previewing || selected.size === 0) return;
    setPreviewing(true);
    setError(null);
    setResults(null);
    try {
      const draft: Draft = { title, caption, cta, hashtags: parseHashtags(hashtags), imagePrompt: "", videoPrompt: "" };
      const res = await fetch("/api/compose/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft, link: link.trim() || undefined, platforms: [...selected] }),
      });
      const data = (await res.json()) as { posts?: PlatformCaption[]; error?: string };
      if (!res.ok || !data.posts) throw new Error(data.error || `Preview failed (${res.status})`);
      setPreviews(data.posts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build the preview.");
    } finally {
      setPreviewing(false);
    }
  }

  async function publish() {
    if (publishing || !previews || previews.length === 0) return;
    setPublishing(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch("/api/compose/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, url: mediaUrl || undefined, link: link.trim() || undefined, title, posts: previews }),
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
    if (publishing || !previews || previews.length === 0) return;
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
          type,
          url: mediaUrl || undefined,
          link: link.trim() || undefined,
          title,
          caption,
          hashtags: parseHashtags(hashtags),
          posts: previews,
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

  function updatePreview(platform: string, value: string) {
    setPreviews((prev) => (prev ? prev.map((p) => (p.platform === platform ? { ...p, caption: value } : p)) : prev));
  }

  const fieldCls =
    "w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-boss-violet/60";
  const primaryBtn =
    "inline-flex items-center gap-2 rounded-xl bg-boss-gold px-5 py-2.5 text-sm font-semibold text-black transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40";
  const ghostBtn =
    "inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:text-slate-900 disabled:opacity-40";
  const chipBtn =
    "rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:text-slate-900 disabled:opacity-40";

  if (!status.aiConfigured) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
        AI copywriting isn&apos;t turned on yet. Set <code className="text-boss-gold">ANTHROPIC_API_KEY</code> in the
        project to enable the AI Social Post composer.
      </div>
    );
  }

  const genLabel = generating
    ? type === "video"
      ? "Rendering…"
      : "Generating…"
    : mediaUrl
      ? "Regenerate"
      : refUrl
        ? type === "video"
          ? "Animate reference"
          : "Edit reference"
        : `Generate ${type}`;

  return (
    <div className="flex flex-col gap-5">
      {/* Progress stepper */}
      <ol className="flex items-center gap-1.5">
        {steps.map((id, i) => {
          const active = i === stepIdx;
          const done = i < stepIdx;
          const canJump = unlocked(id);
          return (
            <li key={id} className="flex flex-1 items-center gap-1.5">
              <button
                onClick={() => goTo(id)}
                disabled={!canJump}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition ${
                  active ? "bg-boss-violet/15" : canJump ? "hover:bg-slate-100" : "opacity-40"
                }`}
              >
                <span
                  className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                    active ? "bg-boss-gold text-black" : done ? "bg-emerald-500/20 text-emerald-600" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span className={`hidden text-xs font-medium sm:inline ${active ? "text-slate-900" : "text-slate-500"}`}>{STEP_LABEL[id]}</span>
              </button>
              {i < steps.length - 1 && <span className="hidden h-px w-3 bg-slate-200 sm:block" aria-hidden />}
            </li>
          );
        })}
      </ol>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        {/* ── Step: Idea ─────────────────────────────────────────────── */}
        {step === "idea" && (
          <>
            <h3 className="mb-3 text-base font-semibold text-slate-900">What do you want to post about?</h3>
            <div className="mb-3 grid grid-cols-3 gap-2">
              {TYPES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => pickType(t.id)}
                  className={`flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition ${
                    type === t.id ? "border-boss-violet/60 bg-boss-violet/10" : "border-slate-200 bg-slate-50 hover:border-slate-300"
                  }`}
                >
                  <span className="text-sm font-semibold text-slate-900">
                    <span aria-hidden className="mr-1">
                      {t.emoji}
                    </span>
                    {t.label}
                  </span>
                  <span className="text-[11px] leading-snug text-slate-500">{t.hint}</span>
                </button>
              ))}
            </div>
            <textarea
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              rows={4}
              placeholder="e.g. Promote our free first-time homebuyer webinar this Saturday — friendly, encouraging, aimed at young families."
              className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-[15px] leading-relaxed text-slate-900 placeholder:text-slate-400 outline-none focus:border-boss-violet/60"
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              {hasDraft && (
                <button onClick={() => goTo("copy")} className={ghostBtn}>
                  Keep current draft →
                </button>
              )}
              <button onClick={runDraft} disabled={drafting || !intent.trim()} className={primaryBtn}>
                {drafting && <Spinner />}
                {drafting ? "Writing…" : hasDraft ? "Rewrite with AI" : "Draft with AI"}
              </button>
            </div>
          </>
        )}

        {/* ── Step: Copy ─────────────────────────────────────────────── */}
        {step === "copy" && (
          <>
            <h3 className="mb-3 text-base font-semibold text-slate-900">Review your post</h3>
            <div className="flex flex-col gap-3">
              <Field label={type === "video" ? "Title (also the video title)" : "Title / headline"}>
                <input value={title} onChange={(e) => setTitle(e.target.value)} className={fieldCls} />
              </Field>
              <Field label="Caption">
                <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={5} className={`${fieldCls} resize-y leading-relaxed`} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Call to action">
                  <input value={cta} onChange={(e) => setCta(e.target.value)} className={fieldCls} />
                </Field>
                <Field label="Link / CTA URL (optional)">
                  <input
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    // Neutral: this used to name one specific customer's domain,
                    // which read as a suggestion to every other tenant. The real
                    // value is prefilled from the Brand Kit when one is set.
                    placeholder="https://yourcompany.com"
                    className={fieldCls}
                  />
                </Field>
              </div>
              <Field label="Hashtags">
                <input value={hashtags} onChange={(e) => setHashtags(e.target.value)} className={fieldCls} />
              </Field>
            </div>
            <NavRow onBack={back}>
              <button onClick={() => goTo(needsMedia ? "media" : "publish")} className={primaryBtn}>
                Continue →
              </button>
            </NavRow>
          </>
        )}

        {/* ── Step: Media ────────────────────────────────────────────── */}
        {step === "media" && needsMedia && (
          <>
            <h3 className="mb-1 text-base font-semibold text-slate-900">Generate the {type}</h3>
            <p className="mb-2 text-xs text-slate-500">The AI wrote this {type} prompt from your post. Tweak it, then generate.</p>
            <textarea value={mediaPrompt} onChange={(e) => setMediaPrompt(e.target.value)} rows={3} className={`${fieldCls} resize-y`} />

            {/* Optional reference image to guide generation */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-400">Reference {type === "video" ? "(animate an image)" : "(edit an image)"}:</span>
              {refUrl ? (
                <span className="inline-flex items-center gap-2 rounded-lg border border-boss-gold/30 bg-boss-gold/10 py-1 pl-1 pr-2 text-xs">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={refUrl} alt="reference" className="size-6 rounded object-cover" />
                  <span className="text-slate-700">Reference set</span>
                  <button onClick={() => setRefUrl(null)} className="text-slate-500 hover:text-slate-900" aria-label="remove reference">
                    ×
                  </button>
                </span>
              ) : (
                <>
                  <button onClick={() => refFileRef.current?.click()} disabled={uploading} className={chipBtn}>
                    {uploading ? "Uploading…" : "+ Upload image"}
                  </button>
                  <button onClick={() => openGallery("ref")} className={chipBtn}>
                    From gallery
                  </button>
                </>
              )}
              <input ref={refFileRef} type="file" accept="image/*" onChange={onPickRef} className="hidden" />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-400">Aspect</span>
              {ASPECTS.map((a) => (
                <button
                  key={a}
                  onClick={() => setAspect(a)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ring-1 transition ${
                    aspect === a ? "bg-slate-100 text-slate-900 ring-slate-300" : "text-slate-500 ring-slate-200 hover:text-slate-900"
                  }`}
                >
                  {a}
                </button>
              ))}
              <button onClick={generateMedia} disabled={generating || !mediaPrompt.trim()} className={`${primaryBtn} ml-auto`}>
                {generating && <Spinner />}
                {genLabel}
              </button>
            </div>
            {type === "video" && (
              <div className="mt-3">
                <NotifyChoice n={notifier} />
              </div>
            )}
            {generating && type === "video" && (
              <p className="mt-2 text-center text-xs text-slate-500">
                Rendering video — this usually takes 1–3 minutes.{" "}
                {notifier.mode === "notify" ? "You can switch tabs; we'll notify you." : "Keep this tab open."}
              </p>
            )}

            {/* Or use your own media directly */}
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500">Already have {type === "video" ? "a video" : "an image"}? Use it directly:</span>
                <button onClick={() => mediaFileRef.current?.click()} disabled={uploading} className={chipBtn}>
                  {uploading ? "Uploading…" : `Upload ${type}`}
                </button>
                <button onClick={() => openGallery("media")} className={chipBtn}>
                  From gallery
                </button>
              </div>
              <input ref={mediaFileRef} type="file" accept={type === "video" ? "video/*" : "image/*"} onChange={onPickOwnMedia} className="hidden" />
            </div>

            {mediaUrl && (
              <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                {type === "video" ? (
                  <video src={mediaUrl} controls loop className="max-h-[45dvh] w-full" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaUrl} alt="Post media" className="max-h-[45dvh] w-full object-contain" />
                )}
              </div>
            )}

            {mediaUrl && type === "video" && (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                {!voiceOpen ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-500">
                      This clip is silent — generated video has no audio.
                    </span>
                    <button
                      onClick={() => {
                        // Seed from the copy they already wrote rather than an
                        // empty box; it is usually most of the read.
                        setVoiceScript((v) => v || caption);
                        setVoiceOpen(true);
                      }}
                      className={chipBtn}
                    >
                      🎙 Add a voiceover
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      What the voice says
                    </div>
                    <textarea
                      value={voiceScript}
                      onChange={(e) => setVoiceScript(e.target.value)}
                      rows={3}
                      maxLength={800}
                      placeholder="Keep it to what fits the clip — about 2.5 words a second."
                      className={`${fieldCls} mt-2 resize-y leading-relaxed`}
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => void runVoiceover()}
                        disabled={voicing || !voiceScript.trim()}
                        className={primaryBtn}
                      >
                        {voicing ? "Narrating…" : "Add voiceover · 3cr"}
                      </button>
                      <button onClick={() => setVoiceOpen(false)} disabled={voicing} className={chipBtn}>
                        Cancel
                      </button>
                      <span className="text-[11px] text-slate-400">
                        The narration is trimmed to the clip&rsquo;s length, so a long script gets cut.
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}

            <NavRow onBack={back}>
              <button onClick={() => goTo("publish")} disabled={!mediaUrl} className={primaryBtn}>
                Continue →
              </button>
            </NavRow>
          </>
        )}

        {/* ── Step: Publish ──────────────────────────────────────────── */}
        {step === "publish" && (
          <>
            <h3 className="mb-3 text-base font-semibold text-slate-900">Post to your channels</h3>
            {configuredEligible.length === 0 ? (
              <p className="text-sm text-slate-500">
                No channels are set up for {type} posts yet.{" "}
                <Link href="/connections" className="text-boss-gold underline underline-offset-2">
                  Connect an account →
                </Link>
              </p>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {configuredEligible.map((p) => {
                    const meta = PLATFORM_META[p];
                    if (!isConnected(p)) {
                      return (
                        <a
                          key={p}
                          href={meta.connectPath}
                          className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 transition hover:border-boss-violet/50 hover:text-slate-900"
                        >
                          Connect {meta.label}
                        </a>
                      );
                    }
                    const on = selected.has(p);
                    return (
                      <button
                        key={p}
                        onClick={() => toggle(p)}
                        title={accountFor(p) ?? undefined}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                          on ? "border-boss-gold/50 bg-boss-gold/15 text-boss-gold" : "border-slate-200 bg-slate-50 text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        {on ? "✓ " : ""}
                        {meta.label}
                      </button>
                    );
                  })}
                </div>

                {!previews && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-400">{selected.size ? `${selected.size} selected` : "Select channels above"}</span>
                    <button onClick={runPreview} disabled={previewing || selected.size === 0} className={`${primaryBtn} !bg-boss-violet !text-white`}>
                      {previewing && <Spinner light />}
                      {previewing ? "Tailoring…" : "Preview per channel"}
                    </button>
                  </div>
                )}

                {previews && (
                  <div className="mt-1 flex flex-col gap-3">
                    <p className="text-xs text-slate-500">AI tailored a caption for each channel. Edit anything, then publish.</p>
                    {previews.map((p) => (
                      <div key={p.platform} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="mb-1.5 flex items-center gap-2 text-xs">
                          <span className="font-semibold text-slate-900">{PLATFORM_META[p.platform]?.label ?? p.platform}</span>
                          {accountFor(p.platform) && <span className="text-slate-400">· {accountFor(p.platform)}</span>}
                        </div>
                        {needsMedia && mediaUrl && (
                          <div className="mb-2 overflow-hidden rounded-lg border border-slate-200">
                            {type === "video" ? (
                              <video src={mediaUrl} muted className="max-h-40 w-full object-cover" />
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={mediaUrl} alt="" className="max-h-40 w-full object-cover" />
                            )}
                          </div>
                        )}
                        <textarea value={p.caption} onChange={(e) => updatePreview(p.platform, e.target.value)} rows={3} className={`${fieldCls} resize-y`} />
                      </div>
                    ))}
                    {scheduled ? (
                      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700">
                        Scheduled ✓ — it&apos;ll post automatically at your chosen time. Track it under{" "}
                        <Link href="/actions" className="font-semibold underline underline-offset-2">
                          Scheduled
                        </Link>
                        .
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-sm">
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
                              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-boss-violet/60"
                            />
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <button onClick={runPreview} disabled={previewing} className="text-xs text-slate-500 underline underline-offset-2 transition hover:text-slate-900 disabled:opacity-40">
                            {previewing ? "Re-tailoring…" : "Re-tailor with AI"}
                          </button>
                          {publishMode === "now" ? (
                            <button onClick={publish} disabled={publishing} className={primaryBtn}>
                              {publishing && <Spinner />}
                              {publishing ? "Publishing…" : `Publish to ${previews.length} channel${previews.length > 1 ? "s" : ""}`}
                            </button>
                          ) : (
                            <button onClick={schedule} disabled={publishing} className={primaryBtn}>
                              {publishing && <Spinner />}
                              {publishing ? "Scheduling…" : "Schedule post"}
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
            <NavRow onBack={back} />
          </>
        )}
      </section>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-sm text-red-700">
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
                <span className="font-medium">{PLATFORM_META[r.platform]?.label ?? r.platform}</span>:{" "}
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

      {gallery && (
        <GalleryModal
          mode={gallery.mode}
          loading={gallery.loading}
          items={gallery.items}
          onPick={pickFromGallery}
          onClose={() => setGallery(null)}
        />
      )}
    </div>
  );
}

function GalleryModal({
  mode,
  loading,
  items,
  onPick,
  onClose,
}: {
  mode: "ref" | "media";
  loading: boolean;
  items: GalleryItem[];
  onPick: (url: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true">
      <div className="relative flex max-h-[85dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h4 className="text-sm font-semibold text-slate-900">
            {mode === "ref" ? "Pick a reference image" : "Pick from your gallery"}
          </h4>
          <button onClick={onClose} aria-label="Close" className="grid size-7 place-items-center rounded-full bg-slate-100 text-slate-700 hover:text-slate-900">
            ×
          </button>
        </div>
        <div className="overflow-y-auto p-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Nothing saved yet — generate something first.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {items.map((it) => (
                <button
                  key={it.url}
                  onClick={() => onPick(it.url)}
                  className="group aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100 transition hover:border-boss-gold/60"
                >
                  {it.type === "video" ? (
                    <video src={it.url} muted className="size-full object-cover" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.url} alt="" className="size-full object-cover transition group-hover:scale-105" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NavRow({ onBack, children }: { onBack: () => void; children?: React.ReactNode }) {
  return (
    <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-200 pt-3">
      <button onClick={onBack} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition hover:text-slate-900">
        ← Back
      </button>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Spinner({ light = false }: { light?: boolean }) {
  return (
    <span
      className={`size-4 animate-spin rounded-full border-2 ${light ? "border-white/40 border-t-white" : "border-black/30 border-t-black"}`}
      aria-hidden
    />
  );
}
