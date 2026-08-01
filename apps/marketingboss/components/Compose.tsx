"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

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
};

// Which platforms can carry each post type.
const ELIGIBLE: Record<PostType, string[]> = {
  text: ["facebook", "threads", "linkedin"],
  image: ["facebook", "instagram", "threads", "linkedin", "pinterest"],
  video: ["youtube"],
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

export default function Compose({ status }: { status: ComposeStatus }) {
  const [type, setType] = useState<PostType>("image");
  const [intent, setIntent] = useState("");
  const [drafting, setDrafting] = useState(false);

  const [hasDraft, setHasDraft] = useState(false);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [cta, setCta] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [link, setLink] = useState("");
  const [mediaPrompt, setMediaPrompt] = useState("");

  const [aspect, setAspect] = useState<Aspect>("1:1");
  const [generating, setGenerating] = useState(false);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewing, setPreviewing] = useState(false);
  const [previews, setPreviews] = useState<PlatformCaption[] | null>(null);

  const [publishing, setPublishing] = useState(false);
  const [results, setResults] = useState<PubResult[] | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const isCreditError = !!error && /credit/i.test(error);

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

  // A step is reachable once its prerequisites are met.
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
    // A new format invalidates everything downstream.
    setHasDraft(false);
    setMediaUrl(null);
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
      const data = (await res.json()) as { draft?: Draft; error?: string };
      if (!res.ok || !data.draft) throw new Error(data.error || `Draft failed (${res.status})`);
      const d = data.draft;
      setTitle(d.title);
      setCaption(d.caption);
      setCta(d.cta);
      setHashtags((d.hashtags || []).map((h) => `#${h.replace(/^#/, "")}`).join(" "));
      setMediaPrompt(type === "image" ? d.imagePrompt : type === "video" ? d.videoPrompt : "");
      setHasDraft(true);
      setSelected(new Set(eligible.filter((p) => isConnected(p))));
      setStepIdx(1); // advance to Copy
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
        body: JSON.stringify({ type, prompt: p, aspect }),
      });
      const data = (await res.json()) as { urls?: string[]; error?: string };
      if (!res.ok) throw new Error(data.error || `Generation failed (${res.status})`);
      setMediaUrl((data.urls || [])[0] ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setGenerating(false);
    }
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

  function updatePreview(platform: string, value: string) {
    setPreviews((prev) => (prev ? prev.map((p) => (p.platform === platform ? { ...p, caption: value } : p)) : prev));
  }

  const fieldCls =
    "w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/35 outline-none focus:border-boss-violet/60";
  const primaryBtn =
    "inline-flex items-center gap-2 rounded-xl bg-boss-gold px-5 py-2.5 text-sm font-semibold text-black transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40";
  const ghostBtn =
    "inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium text-white/70 transition hover:text-white disabled:opacity-40";

  if (!status.aiConfigured) {
    return (
      <div className="rounded-2xl border border-white/10 bg-ink-2/70 p-5 text-sm text-white/60">
        AI copywriting isn&apos;t turned on yet. Set <code className="text-boss-gold">ANTHROPIC_API_KEY</code> in the
        project to enable the AI Social Post composer.
      </div>
    );
  }

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
                  active ? "bg-boss-violet/15" : canJump ? "hover:bg-white/5" : "opacity-40"
                }`}
              >
                <span
                  className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                    active
                      ? "bg-boss-gold text-black"
                      : done
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-white/10 text-white/50"
                  }`}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span className={`hidden text-xs font-medium sm:inline ${active ? "text-white" : "text-white/50"}`}>
                  {STEP_LABEL[id]}
                </span>
              </button>
              {i < steps.length - 1 && <span className="hidden h-px w-3 bg-white/10 sm:block" aria-hidden />}
            </li>
          );
        })}
      </ol>

      <section className="rounded-2xl border border-white/10 bg-ink-2/70 p-4 sm:p-5">
        {/* ── Step: Idea ─────────────────────────────────────────────── */}
        {step === "idea" && (
          <>
            <h3 className="mb-3 text-base font-semibold text-white">What do you want to post about?</h3>
            <div className="mb-3 grid grid-cols-3 gap-2">
              {TYPES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => pickType(t.id)}
                  className={`flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition ${
                    type === t.id ? "border-boss-violet/60 bg-boss-violet/10" : "border-white/10 bg-black/20 hover:border-white/25"
                  }`}
                >
                  <span className="text-sm font-semibold text-white">
                    <span aria-hidden className="mr-1">
                      {t.emoji}
                    </span>
                    {t.label}
                  </span>
                  <span className="text-[11px] leading-snug text-white/45">{t.hint}</span>
                </button>
              ))}
            </div>
            <textarea
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              rows={4}
              placeholder="e.g. Promote our free first-time homebuyer webinar this Saturday — friendly, encouraging, aimed at young families."
              className="w-full resize-y rounded-xl border border-white/10 bg-black/30 p-3.5 text-[15px] leading-relaxed text-white placeholder:text-white/35 outline-none focus:border-boss-violet/60"
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
            <h3 className="mb-3 text-base font-semibold text-white">Review your post</h3>
            <div className="flex flex-col gap-3">
              <Field label={type === "video" ? "Title (also the video title)" : "Title / headline"}>
                <input value={title} onChange={(e) => setTitle(e.target.value)} className={fieldCls} />
              </Field>
              <Field label="Caption">
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={5}
                  className={`${fieldCls} resize-y leading-relaxed`}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Call to action">
                  <input value={cta} onChange={(e) => setCta(e.target.value)} className={fieldCls} />
                </Field>
                <Field label="Link / CTA URL (optional)">
                  <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://avasc.org" className={fieldCls} />
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
            <h3 className="mb-1 text-base font-semibold text-white">Generate the {type}</h3>
            <p className="mb-2 text-xs text-white/45">The AI wrote this {type} prompt from your post. Tweak it, then generate.</p>
            <textarea
              value={mediaPrompt}
              onChange={(e) => setMediaPrompt(e.target.value)}
              rows={3}
              className={`${fieldCls} resize-y`}
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-white/40">Aspect</span>
              {ASPECTS.map((a) => (
                <button
                  key={a}
                  onClick={() => setAspect(a)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ring-1 transition ${
                    aspect === a ? "bg-white/10 text-white ring-white/25" : "text-white/50 ring-white/10 hover:text-white/80"
                  }`}
                >
                  {a}
                </button>
              ))}
              <button onClick={generateMedia} disabled={generating || !mediaPrompt.trim()} className={`${primaryBtn} ml-auto`}>
                {generating && <Spinner />}
                {generating ? (type === "video" ? "Rendering…" : "Generating…") : mediaUrl ? "Regenerate" : `Generate ${type}`}
              </button>
            </div>
            {generating && type === "video" && (
              <p className="mt-2 text-center text-xs text-white/45">Rendering video — this usually takes 1–3 minutes.</p>
            )}
            {mediaUrl && (
              <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black/40">
                {type === "video" ? (
                  <video src={mediaUrl} controls loop className="max-h-[45dvh] w-full" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaUrl} alt="Generated media" className="max-h-[45dvh] w-full object-contain" />
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
            <h3 className="mb-3 text-base font-semibold text-white">Post to your channels</h3>
            {configuredEligible.length === 0 ? (
              <p className="text-sm text-white/55">
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
                          className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs text-white/60 transition hover:border-boss-violet/50 hover:text-white"
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
                          on ? "border-boss-gold/50 bg-boss-gold/15 text-boss-gold" : "border-white/15 bg-white/[0.04] text-white/60 hover:text-white"
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
                    <span className="text-[11px] text-white/35">{selected.size ? `${selected.size} selected` : "Select channels above"}</span>
                    <button onClick={runPreview} disabled={previewing || selected.size === 0} className={`${primaryBtn} !bg-boss-violet !text-white`}>
                      {previewing && <Spinner light />}
                      {previewing ? "Tailoring…" : "Preview per channel"}
                    </button>
                  </div>
                )}

                {previews && (
                  <div className="mt-1 flex flex-col gap-3">
                    <p className="text-xs text-white/45">AI tailored a caption for each channel. Edit anything, then publish.</p>
                    {previews.map((p) => (
                      <div key={p.platform} className="rounded-xl border border-white/10 bg-black/20 p-3">
                        <div className="mb-1.5 flex items-center gap-2 text-xs">
                          <span className="font-semibold text-white/80">{PLATFORM_META[p.platform]?.label ?? p.platform}</span>
                          {accountFor(p.platform) && <span className="text-white/35">· {accountFor(p.platform)}</span>}
                        </div>
                        {needsMedia && mediaUrl && (
                          <div className="mb-2 overflow-hidden rounded-lg border border-white/10">
                            {type === "video" ? (
                              <video src={mediaUrl} muted className="max-h-40 w-full object-cover" />
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={mediaUrl} alt="" className="max-h-40 w-full object-cover" />
                            )}
                          </div>
                        )}
                        <textarea
                          value={p.caption}
                          onChange={(e) => updatePreview(p.platform, e.target.value)}
                          rows={3}
                          className={`${fieldCls} resize-y`}
                        />
                      </div>
                    ))}
                    <div className="flex items-center justify-between gap-2">
                      <button onClick={runPreview} disabled={previewing} className="text-xs text-white/50 underline underline-offset-2 transition hover:text-white disabled:opacity-40">
                        {previewing ? "Re-tailoring…" : "Re-tailor with AI"}
                      </button>
                      <button onClick={publish} disabled={publishing} className={primaryBtn}>
                        {publishing && <Spinner />}
                        {publishing ? "Publishing…" : `Publish to ${previews.length} channel${previews.length > 1 ? "s" : ""}`}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
            <NavRow onBack={back} />
          </>
        )}
      </section>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-sm text-red-200">
          {error}
          {isCreditError && (
            <Link href="/billing" className="ml-2 inline-block font-semibold text-boss-gold underline underline-offset-2 hover:brightness-110">
              Buy more credits →
            </Link>
          )}
        </div>
      )}

      {results && (
        <div className="rounded-2xl border border-white/10 bg-ink-2/70 p-4 sm:p-5">
          <div className="mb-2 text-sm font-semibold text-white">Results</div>
          <ul className="space-y-1.5 text-sm">
            {results.map((r) => (
              <li key={r.platform} className={r.ok ? "text-emerald-300" : "text-red-300"}>
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
    </div>
  );
}

function NavRow({ onBack, children }: { onBack: () => void; children?: React.ReactNode }) {
  return (
    <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/10 pt-3">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-white/55 transition hover:text-white"
      >
        ← Back
      </button>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-white/40">{label}</span>
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
