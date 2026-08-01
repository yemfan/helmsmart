"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PRESETS } from "@/lib/presets";
import SocialPublish, { type SocialStatus } from "@/components/SocialPublish";

type Mode = "image" | "video";
const ASPECTS = ["16:9", "9:16", "1:1", "4:3", "3:4"] as const;
type Aspect = (typeof ASPECTS)[number];

type StudioProps = {
  youtubeEnabled?: boolean;
  youtubeConnected?: boolean;
  youtubeChannel?: string | null;
  social?: SocialStatus;
};

export default function Studio({
  youtubeEnabled = false,
  youtubeConnected = false,
  youtubeChannel = null,
  social,
}: StudioProps) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [uid, setUid] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("image");
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState<Aspect>("16:9");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<string[]>([]);
  const [resultMode, setResultMode] = useState<Mode>("image");
  const [resultPrompt, setResultPrompt] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const [refUrl, setRefUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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

        {!hasRef && (
          <div className="mt-4">
            <span className="text-xs text-white/35">Start from a preset:</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p.id)}
                  title={`${p.mode} · ${p.aspect}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-boss-violet/50 hover:text-white"
                >
                  <span aria-hidden>{p.emoji}</span>
                  {p.label}
                </button>
              ))}
            </div>
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

      {results.length > 0 && !modalOpen && (
        <button
          onClick={() => setModalOpen(true)}
          className="mx-auto inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/70 transition hover:text-white"
        >
          ✓ Saved to your gallery · View result ↗
        </button>
      )}

      {modalOpen && results.length > 0 && (
        <ResultModal
          urls={results}
          mode={resultMode}
          defaultTitle={resultPrompt}
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
  defaultTitle,
  youtubeEnabled,
  youtubeConnected,
  youtubeChannel,
  social,
  onClose,
}: {
  urls: string[];
  mode: Mode;
  defaultTitle: string;
  youtubeEnabled: boolean;
  youtubeConnected: boolean;
  youtubeChannel: string | null;
  social?: SocialStatus;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Generated result"
    >
      <div
        className="relative flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-ink-2 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 grid size-8 place-items-center rounded-full bg-black/50 text-lg text-white/80 transition hover:bg-black/70 hover:text-white"
        >
          ×
        </button>

        <div className="overflow-y-auto">
          {urls.map((url) => (
            <div key={url} className="bg-black/40">
              {mode === "video" ? (
                <video src={url} controls autoPlay loop className="max-h-[60dvh] w-full" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="Generated marketing creative" className="max-h-[60dvh] w-full object-contain" />
              )}
            </div>
          ))}

          {mode === "video" && youtubeEnabled && (
            <YoutubePublish
              url={urls[0]}
              defaultTitle={defaultTitle}
              connected={youtubeConnected}
              channel={youtubeChannel}
            />
          )}
          {mode === "image" && social && (
            <SocialPublish url={urls[0]} defaultCaption={defaultTitle} status={social} />
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3 text-sm">
          <span className="text-white/50">Saved to your gallery</span>
          <div className="flex items-center gap-2">
            <Link href="/gallery" className="rounded-lg px-3 py-1.5 font-medium text-white/60 transition hover:text-white">
              Gallery
            </Link>
            <a
              href={urls[0]}
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
    <div className="border-t border-white/10 bg-black/20 px-4 py-3">
      {published ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-emerald-300">Published to YouTube ✓</span>
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
          <span className="text-white/60">Publish this clip straight to your YouTube channel.</span>
          <a
            href="/api/youtube/connect"
            className="whitespace-nowrap rounded-lg bg-[#FF0000] px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110"
          >
            Connect YouTube
          </a>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs text-white/45">
            <span>▶ Publish to YouTube</span>
            {channel && <span className="text-white/30">· {channel}</span>}
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            placeholder="Video title"
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/35 outline-none focus:border-boss-violet/60"
          />
          <div className="flex items-center gap-2">
            <select
              value={privacy}
              onChange={(e) => setPrivacy(e.target.value as "unlisted" | "public" | "private")}
              className="rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-sm text-white/80 outline-none focus:border-boss-violet/60"
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
          {err && <p className="text-xs text-red-300">{err}</p>}
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
