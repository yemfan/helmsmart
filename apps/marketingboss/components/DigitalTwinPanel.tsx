"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { BrandKit } from "@/lib/brandKit";

/**
 * Your identical twin — photo, voice, and a video of the two together.
 *
 * Three things that were previously scattered or missing: the portrait had
 * nowhere to live, the voice clone sat in a Settings tab with no owner recorded
 * against it, and there was no way to see the result. A twin you cannot look at
 * is just a row in a table.
 *
 * Consent is a real gate, not a checkbox for show: the render route refuses
 * without it, because everything here is the user's own likeness.
 */

type Twin = {
  portrait_url: string | null;
  intro_video_url: string | null;
  voice_id: string | null;
  voice_name: string | null;
  consent: boolean;
  avatar_video_url: string | null;
  avatar_script: string | null;
};

const SAMPLE_SCRIPT =
  "Hi, I'm here to help you get more customers without spending your whole week on marketing.";

export default function DigitalTwinPanel({
  email,
  initialTwin,
  brand,
  voiceCloning,
}: {
  email: string;
  initialTwin: Twin | null;
  brand: BrandKit | null;
  voiceCloning: boolean;
}) {
  const supabase = createClient();
  const [twin, setTwin] = useState<Twin | null>(initialTwin);
  const [script, setScript] = useState(SAMPLE_SCRIPT);
  const [busy, setBusy] = useState<"photo" | "video" | "consent" | "film" | null>(null);
  // The video path has three slow stages; say which one is running.
  const [stage, setStage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  const hasPhoto = !!twin?.portrait_url;
  const hasVoice = !!twin?.voice_id;
  const consented = !!twin?.consent;
  const ready = hasPhoto && consented;

  async function patch(body: Record<string, unknown>) {
    const res = await fetch("/api/twin", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Couldn't save.");
    setTwin(data.twin as Twin);
  }

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Pick an image file.");
    setError(null);
    setBusy("photo");
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Still signing in — try again in a second.");
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${user.id}/twin/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("media")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const url = supabase.storage.from("media").getPublicUrl(path).data.publicUrl;
      await patch({ portrait_url: url });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(null);
    }
  }

  /**
   * One video, both halves of the twin: it is kept as the intro clip and its
   * speech becomes the cloned voice.
   *
   * The audio is stripped out in the browser first. A minute of phone video is
   * routinely 60-100MB while its speech is about 1MB, and the clone route
   * refuses anything over 25MB - so uploading the picture would fail on most
   * real recordings, slowly.
   *
   * Gated on consent because a cloned voice can be made to say anything. The
   * note recorded against the clone states the actual basis rather than a
   * generic string, so it means something if it is ever read back.
   */
  async function onPickVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("video/")) return setError("Pick a video file.");
    if (!consented) {
      return setError("Tick the consent box first — cloning your voice needs it.");
    }
    setError(null);
    setBusy("video");
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Still signing in — try again in a second.");

      setStage("Reading the audio out of your video…");
      const { extractVoiceSample } = await import("@/lib/trimClient");
      let sample: File;
      try {
        sample = await extractVoiceSample(file);
      } catch {
        throw new Error(
          "Couldn't read any audio from that video. Check it has sound, or upload a plain audio recording instead.",
        );
      }
      if (sample.size < 60 * 1024) {
        throw new Error(
          "There isn't enough speech in that video to clone from. Aim for about 30 seconds of clear talking.",
        );
      }

      setStage("Uploading…");
      const base = `${user.id}/twin/${crypto.randomUUID()}`;
      const videoExt = (file.name.split(".").pop() || "mp4").toLowerCase();
      const [videoUp, sampleUp] = await Promise.all([
        supabase.storage
          .from("media")
          .upload(`${base}.${videoExt}`, file, { contentType: file.type, upsert: false }),
        supabase.storage
          .from("media")
          .upload(`${base}-voice.m4a`, sample, { contentType: "audio/mp4", upsert: false }),
      ]);
      if (videoUp.error) throw videoUp.error;
      if (sampleUp.error) throw sampleUp.error;

      const videoUrl = supabase.storage.from("media").getPublicUrl(`${base}.${videoExt}`).data.publicUrl;
      const sampleUrl = supabase.storage.from("media").getPublicUrl(`${base}-voice.m4a`).data.publicUrl;

      // Save the clip first: if cloning fails the video is still theirs, and
      // retrying does not mean uploading it again.
      await patch({ intro_video_url: videoUrl });

      setStage("Cloning your voice…");
      const voiceName = (brand?.brand_name || email.split("@")[0] || "My voice").slice(0, 60);
      const res = await fetch("/api/voice-clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sampleUrl,
          name: voiceName,
          consentNote: `Owner confirmed via the twin consent checkbox that the face and voice are their own, and uploaded this intro video on ${new Date().toISOString().slice(0, 10)}.`,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; voiceId?: string; name?: string; error?: string }
        | null;
      if (!res.ok || !data?.ok) {
        throw new Error(
          data?.error || "Your video was saved, but the voice couldn't be cloned from it.",
        );
      }
      setTwin((t) =>
        t ? { ...t, voice_id: data.voiceId ?? t.voice_id, voice_name: data.name ?? voiceName } : t,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(null);
      setStage("");
    }
  }

  async function toggleConsent(next: boolean) {
    setError(null);
    setBusy("consent");
    try {
      await patch({ consent: next });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(null);
    }
  }

  async function film() {
    setError(null);
    setBusy("film");
    try {
      const res = await fetch("/api/twin/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't film that.");
      setTwin((t) => (t ? { ...t, avatar_video_url: data.url, avatar_script: script } : t));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Identity */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex items-start gap-4">
          <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200">
            {hasPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={twin!.portrait_url!} alt="Your twin" className="size-full object-cover" />
            ) : (
              <div className="grid size-full place-items-center text-2xl font-semibold text-slate-400">
                {(email?.[0] ?? "?").toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{brand?.brand_name || email}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {hasPhoto ? "Photo set" : "No photo yet"} ·{" "}
              {hasVoice ? `Voice: ${twin?.voice_name || "your clone"}` : "Default narrator"}
            </p>
            <button
              onClick={() => photoRef.current?.click()}
              disabled={busy !== null}
              className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:text-slate-900 disabled:opacity-40"
            >
              {busy === "photo" ? "Uploading…" : hasPhoto ? "Change photo" : "Add a photo"}
            </button>
            <input ref={photoRef} type="file" accept="image/*" onChange={onPickPhoto} className="hidden" />
            <p className="mt-2 text-[11px] text-slate-400">
              Head and shoulders, facing the camera, good light. This is the face your twin wears.
            </p>
          </div>
        </div>
      </section>

      {/* Consent — the gate every render passes through */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={consented}
            disabled={busy !== null}
            onChange={(e) => toggleConsent(e.target.checked)}
            className="mt-0.5 size-4 accent-boss-violet"
          />
          <span className="text-sm text-slate-700">
            This photo and voice are my own, and I agree to them being used to generate videos of me.
            <span className="mt-1 block text-[11px] text-slate-400">
              Required before your twin can appear on camera. Untick it at any time and filming stops.
            </span>
          </span>
        </label>
      </section>

      {/* Voice + brand — the two halves that make the twin say something */}
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold">Your voice</p>
          <p className="mt-1 text-xs text-slate-500">
            {hasVoice
              ? `Cloned — “${twin?.voice_name}”. Your twin speaks with it.`
              : voiceCloning
                ? "Upload a short video of yourself talking. The speech becomes your voice — you don't need a separate recording."
                : "Voice cloning isn't switched on for this server."}
          </p>

          {voiceCloning && (
            <>
              <button
                onClick={() => videoRef.current?.click()}
                disabled={busy !== null || !consented}
                className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:text-slate-900 disabled:opacity-40"
              >
                {busy === "video"
                  ? "Working…"
                  : hasVoice
                    ? "Use a new video"
                    : "Upload a video"}
              </button>
              <input
                ref={videoRef}
                type="file"
                accept="video/*"
                onChange={onPickVideo}
                className="hidden"
              />
              {!consented && (
                <p className="mt-1.5 text-[11px] text-amber-700">
                  Tick the consent box below first.
                </p>
              )}
              {busy === "video" && stage && (
                <p className="mt-1.5 text-[11px] text-slate-500">{stage}</p>
              )}
              {busy === "video" && (
                <p className="mt-0.5 text-[11px] text-slate-400">
                  The audio is pulled out here in your browser, so only the sound is uploaded.
                  Keep this tab open.
                </p>
              )}
              <p className="mt-1.5 text-[11px] text-slate-400">
                About 30 seconds of clear talking, one person, no background music.
              </p>
            </>
          )}

          <Link
            href="/settings?tab=voice"
            className="mt-2 inline-block text-xs font-medium text-boss-violet underline underline-offset-2"
          >
            {hasVoice ? "Re-record from audio →" : "Upload an audio file instead →"}
          </Link>

          {twin?.intro_video_url && (
            <div className="mt-3">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video src={twin.intro_video_url} controls className="w-full rounded-lg" />
              <p className="mt-1 text-[11px] text-slate-400">Your intro video.</p>
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold">Brand Kit</p>
          <p className="mt-1 text-xs text-slate-500">
            {brand?.brand_name
              ? `${brand.brand_name}${brand.audience ? ` · for ${brand.audience}` : ""}`
              : "Not set up yet — it's what your twin talks about."}
          </p>
          <Link
            href="/settings?tab=brand"
            className="mt-2 inline-block text-xs font-medium text-boss-violet underline underline-offset-2"
          >
            Edit brand kit →
          </Link>
        </div>
      </section>

      {/* The twin, on camera */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <p className="text-sm font-semibold">See your twin</p>
        <p className="mt-1 text-xs text-slate-500">
          Give it a line and it films itself — your face, your voice, real lip sync.
        </p>
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          rows={3}
          className="mt-2 w-full rounded-lg border border-slate-200 p-2 text-sm"
        />
        <button
          onClick={film}
          disabled={busy !== null || !ready || !script.trim()}
          className="mt-2 rounded-lg bg-boss-violet px-4 py-2 text-sm font-medium text-white shadow disabled:opacity-40"
        >
          {busy === "film" ? "Filming…" : "Film it"}
        </button>
        {!ready && (
          <p className="mt-2 text-[11px] text-amber-700">
            {!hasPhoto ? "Add a photo first." : "Tick the consent box first."}
          </p>
        )}
        {busy === "film" && (
          <p className="mt-1 text-[11px] text-slate-400">This takes about a minute. Keep this tab open.</p>
        )}
        {twin?.avatar_video_url && (
          <div className="mt-3">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video src={twin.avatar_video_url} controls className="w-full rounded-lg" />
            {twin.avatar_script && (
              <p className="mt-1 text-[11px] text-slate-400">“{twin.avatar_script}”</p>
            )}
          </div>
        )}
      </section>

      {error && <p className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}
    </div>
  );
}
