"use client";

import { useEffect, useRef, useState } from "react";
import { uploadViaStorage } from "@/lib/uploads/uploadViaStorage";

/**
 * Digital Twin (Phase A) — the agent uploads a short intro video; we transcribe
 * it and Claude distills a brand profile (bio/specialties/market/tone/tagline)
 * that personalizes their AI-generated marketing. Consent-gated (their own
 * likeness/voice). Voice clone + talking avatar are later phases.
 */

type Profile = { bio: string; specialties: string[]; market: string; tone: string; tagline: string };

const EMPTY: Profile = { bio: "", specialties: [], market: "", tone: "", tagline: "" };

type VoiceCloneState = {
  configured: boolean;
  consent: boolean;
  hasIntroVideo: boolean;
  status: "uploaded" | "processing" | "pending" | "ready" | "failed" | null;
  hasClone: boolean;
  acknowledged: boolean;
  useClonedVoice: boolean;
  error: string | null;
};

type VoiceCloneResp = Partial<VoiceCloneState> & { ok?: boolean; error?: string };

type AvatarState = {
  configured: boolean;
  hasIntroVideo: boolean;
  voiceReady: boolean;
  script: string | null;
  videoUrl: string | null;
};

type AvatarResp = Partial<AvatarState> & {
  ok?: boolean;
  error?: string;
  audioUrl?: string;
  audioPath?: string;
};

function toVoiceState(b: VoiceCloneResp): VoiceCloneState {
  return {
    configured: Boolean(b.configured),
    consent: Boolean(b.consent),
    hasIntroVideo: Boolean(b.hasIntroVideo),
    status: b.status ?? null,
    hasClone: Boolean(b.hasClone),
    acknowledged: Boolean(b.acknowledged),
    useClonedVoice: Boolean(b.useClonedVoice),
    error: b.error ?? null,
  };
}

export default function DigitalTwinPanel() {
  const [configured, setConfigured] = useState(true);
  const [status, setStatus] = useState<string>("idle");
  const [consent, setConsent] = useState(false);
  const [hasVideo, setHasVideo] = useState(false);
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile>(EMPTY);
  const [uploading, setUploading] = useState(false);
  const [building, setBuilding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Phase B — voice clone (from the same intro video).
  const [vc, setVc] = useState<VoiceCloneState | null>(null);
  const [vcBusy, setVcBusy] = useState<string | null>(null);
  const [vcError, setVcError] = useState<string | null>(null);

  // Phase C — talking avatar.
  const [av, setAv] = useState<AvatarState | null>(null);
  const [avTopic, setAvTopic] = useState("");
  const [avScript, setAvScript] = useState("");
  const [avAudioUrl, setAvAudioUrl] = useState<string | null>(null);
  const [avAudioPath, setAvAudioPath] = useState<string | null>(null);
  const [avBusy, setAvBusy] = useState<string | null>(null);
  const [avError, setAvError] = useState<string | null>(null);

  async function loadAvatar() {
    try {
      const res = await fetch("/api/dashboard/avatar");
      const b = (await res.json().catch(() => ({}))) as AvatarResp;
      if (b.ok) {
        setAv({
          configured: Boolean(b.configured),
          hasIntroVideo: Boolean(b.hasIntroVideo),
          voiceReady: Boolean(b.voiceReady),
          script: b.script ?? null,
          videoUrl: b.videoUrl ?? null,
        });
        if (b.script) setAvScript(b.script);
      }
    } catch {
      /* best-effort */
    }
  }

  async function avatarAction(action: "draft" | "preview" | "render") {
    setAvBusy(action);
    setAvError(null);
    try {
      const res = await fetch("/api/dashboard/avatar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          action === "draft"
            ? { action, topic: avTopic }
            : { action, text: avScript, audioPath: avAudioPath },
        ),
      });
      const b = (await res.json().catch(() => ({}))) as AvatarResp;
      if (!res.ok || !b.ok) {
        setAvError(b.error ?? "Something went wrong.");
        return;
      }
      if (action === "draft" && b.script) setAvScript(b.script);
      if (action === "preview") {
        setAvAudioUrl(b.audioUrl ?? null);
        setAvAudioPath(b.audioPath ?? null);
      }
      if (action === "render" && b.videoUrl) {
        setAv((s) => (s ? { ...s, videoUrl: b.videoUrl ?? s.videoUrl } : s));
      }
    } catch (e) {
      setAvError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setAvBusy(null);
    }
  }

  async function loadVoice() {
    try {
      const res = await fetch("/api/dashboard/voice-clone");
      const b = (await res.json().catch(() => ({}))) as VoiceCloneResp;
      if (b.ok) setVc(toVoiceState(b));
    } catch {
      /* best-effort */
    }
  }

  async function voiceAction(action: string, extra: Record<string, unknown> = {}) {
    setVcBusy(action);
    setVcError(null);
    try {
      const res = await fetch("/api/dashboard/voice-clone", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const b = (await res.json().catch(() => ({}))) as VoiceCloneResp;
      if (!res.ok || !b.ok) {
        setVcError(b.error ?? "Something went wrong.");
        // Refresh so a failed clone shows its stored status/error.
        await loadVoice();
        return;
      }
      setVc(toVoiceState(b));
      // A newly-ready clone unlocks the avatar section — refresh it without a reload.
      await loadAvatar();
    } catch (e) {
      setVcError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setVcBusy(null);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/dashboard/digital-twin");
        const b = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          configured?: boolean;
          status?: string;
          consent?: boolean;
          hasVideo?: boolean;
          profile?: Profile | null;
        };
        if (!b.ok) return;
        setConfigured(b.configured ?? true);
        setStatus(b.status ?? "idle");
        setConsent(Boolean(b.consent));
        setHasVideo(Boolean(b.hasVideo));
        if (b.profile) setProfile({ ...EMPTY, ...b.profile });
      } catch {
        /* best-effort */
      }
      await loadVoice();
      await loadAvatar();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onPickVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || uploading) return;
    if (!file.type.startsWith("video/")) return setError("Please choose a video file.");
    setError(null);
    setUploading(true);
    try {
      const path = await uploadViaStorage(file, "agent_intro_video");
      setVideoPath(path);
      setHasVideo(true);
      setNote("Video uploaded — now build your profile.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function build() {
    if (building) return;
    if (!consent) return setError("Please check the consent box first.");
    if (!videoPath) return setError("Upload your intro video first.");
    setBuilding(true);
    setError(null);
    setNote("Transcribing + building your profile… (a minute or two)");
    try {
      const res = await fetch("/api/dashboard/digital-twin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ videoPath, consent: true }),
      });
      const b = (await res.json().catch(() => ({}))) as { ok?: boolean; profile?: Profile; error?: string };
      if (!res.ok || !b.ok || !b.profile) {
        setError(b.error ?? "Couldn't build your profile.");
        setNote(null);
        return;
      }
      setProfile({ ...EMPTY, ...b.profile });
      setStatus("ready");
      setNote("Your brand profile is ready — edit anything, then Save.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
      setNote(null);
    } finally {
      setBuilding(false);
    }
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/digital-twin", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile }),
      });
      const b = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !b.ok) setError(b.error ?? "Couldn't save.");
      else setNote("Saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setSaving(false);
    }
  }

  const field = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">Your digital twin</h2>
      <p className="mt-0.5 text-sm text-slate-500">
        Record a short intro video (talk to camera — who you are, your market, what you specialize in). AI turns it into
        a brand profile that personalizes all your AI-written marketing. Voice + avatar come later.
      </p>

      {!configured ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          Not enabled yet (needs <code>FAL_KEY</code> + <code>ANTHROPIC_API_KEY</code>).
        </p>
      ) : null}

      {/* Consent */}
      <label className="mt-4 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
        <span className="text-[12px] text-slate-700">
          This video is of <strong>me</strong>, and I consent to CloseBoss using my likeness and voice to generate
          marketing on my behalf. I can revoke this anytime.
        </span>
      </label>

      {/* Upload + build */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || !consent}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          title={consent ? "Upload your intro video" : "Check the consent box first"}
        >
          {uploading ? "Uploading…" : hasVideo ? "Replace intro video" : "Upload intro video"}
        </button>
        <input ref={fileRef} type="file" accept="video/*" onChange={onPickVideo} className="hidden" />
        <button
          type="button"
          onClick={() => void build()}
          disabled={building || !consent || (!videoPath && !hasVideo)}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {building ? "Building…" : status === "ready" ? "Rebuild profile" : "Build my profile"}
        </button>
        {status === "processing" ? <span className="text-[11px] text-slate-500">Processing…</span> : null}
      </div>

      {note ? <p className="mt-2 text-[12px] text-slate-600">{note}</p> : null}
      {error ? <p className="mt-2 text-[12px] text-rose-700">{error}</p> : null}

      {/* Profile (editable) */}
      {(status === "ready" || profile.bio || profile.tagline) && (
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Bio</span>
            <textarea value={profile.bio} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} rows={3} className={`${field} resize-y`} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Market</span>
              <input value={profile.market} onChange={(e) => setProfile({ ...profile, market: e.target.value })} className={field} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Tone / voice</span>
              <input value={profile.tone} onChange={(e) => setProfile({ ...profile, tone: e.target.value })} className={field} />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Specialties (one per line)</span>
            <textarea
              value={profile.specialties.join("\n")}
              onChange={(e) => setProfile({ ...profile, specialties: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 6) })}
              rows={3}
              className={`${field} resize-y`}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Tagline</span>
            <input value={profile.tagline} onChange={(e) => setProfile({ ...profile, tagline: e.target.value })} className={field} />
          </label>
          <div className="flex justify-end">
            <button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
              {saving ? "Saving…" : "Save profile"}
            </button>
          </div>
        </div>
      )}

      {/* Phase B — voice clone */}
      <div className="mt-5 space-y-3 border-t border-slate-100 pt-5">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Your AI voice</h3>
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700">
            Beta
          </span>
        </div>
        <p className="text-[12px] text-slate-500">
          Clone your voice from the <strong>same intro video</strong> — no second recording. We use it to voice your AI
          content. Playback on phone calls is coming; for now this creates your voice so it&apos;s ready.
        </p>

        {vc && !vc.configured ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            Not enabled yet (needs <code>ELEVENLABS_API_KEY</code>).
          </p>
        ) : null}

        {/* Voice consent (separate, explicit) */}
        <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <input
            type="checkbox"
            checked={Boolean(vc?.consent)}
            disabled={vcBusy !== null || !vc?.configured}
            onChange={(e) => void voiceAction("consent", { value: e.target.checked })}
            className="mt-0.5"
          />
          <span className="text-[12px] text-slate-700">
            I consent to CloseBoss creating an AI clone of <strong>my</strong> voice from my intro video. I can revoke
            this anytime.
          </span>
        </label>

        {vc && vc.consent && !vc.hasIntroVideo ? (
          <p className="text-[12px] text-slate-500">Build your profile above first — that saves the intro video your voice is cloned from.</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void voiceAction("start")}
            disabled={vcBusy !== null || !vc?.configured || !vc?.consent || !vc?.hasIntroVideo}
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            title={!vc?.consent ? "Check the voice consent box first" : !vc?.hasIntroVideo ? "Record + build your intro video first" : "Clone my voice"}
          >
            {vcBusy === "start"
              ? "Cloning… (up to a minute)"
              : vc?.hasClone
                ? "Re-clone my voice"
                : "Clone my voice"}
          </button>

          {vc?.status === "ready" && vc.hasClone ? (
            <span className="text-[12px] font-medium text-emerald-700">✓ Voice ready</span>
          ) : vc?.status === "processing" ? (
            <span className="text-[12px] text-slate-500">Processing…</span>
          ) : vc?.status === "failed" ? (
            <span className="text-[12px] text-rose-700">Clone failed</span>
          ) : null}
        </div>

        {/* Review + activate */}
        {vc?.status === "ready" && vc.hasClone ? (
          <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
            {!vc.acknowledged ? (
              <button
                type="button"
                onClick={() => void voiceAction("acknowledge")}
                disabled={vcBusy !== null}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {vcBusy === "acknowledge" ? "Saving…" : "This is my voice — confirm"}
              </button>
            ) : (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={vc.useClonedVoice}
                  disabled={vcBusy !== null}
                  onChange={(e) => void voiceAction("activate", { on: e.target.checked })}
                />
                <span className="text-slate-700">Use my cloned voice for AI content (once phone playback is enabled)</span>
              </label>
            )}
          </div>
        ) : null}

        {/* Only the current session's attempt shows the full error — a reload clears it.
            (A stored failure still shows the compact "Clone failed" label by the button.) */}
        {vcError ? <p className="text-[12px] text-rose-700">{vcError}</p> : null}
      </div>

      {/* Phase C — talking avatar */}
      <div className="mt-5 space-y-3 border-t border-slate-100 pt-5">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-900">AI avatar video</h3>
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700">
            Beta
          </span>
        </div>
        <p className="text-[12px] text-slate-500">
          Turn a script into a talking-head video of <strong>you</strong> — your face (intro video) speaking in your
          cloned voice. Drafting + the voice preview are free; the video render is a separate step so you hear it first.
        </p>

        {av && !av.configured ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            Not enabled yet (needs <code>FAL_KEY</code> + <code>ELEVENLABS_API_KEY</code>).
          </p>
        ) : av && !av.voiceReady ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
            Clone your voice above first — the avatar speaks in your cloned voice.
          </p>
        ) : av ? (
          <>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex-1 min-w-[200px]">
                <span className="text-xs font-medium text-slate-600">Topic (optional)</span>
                <input
                  value={avTopic}
                  onChange={(e) => setAvTopic(e.target.value)}
                  placeholder="e.g. a new listing, market update, just introduce myself"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </label>
              <button
                type="button"
                onClick={() => void avatarAction("draft")}
                disabled={avBusy !== null}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {avBusy === "draft" ? "Writing…" : "Draft script"}
              </button>
            </div>

            <label className="block">
              <span className="text-xs font-medium text-slate-600">Script (edit freely)</span>
              <textarea
                value={avScript}
                onChange={(e) => {
                  setAvScript(e.target.value);
                  // Editing the script invalidates a prior voice preview.
                  setAvAudioUrl(null);
                  setAvAudioPath(null);
                }}
                rows={4}
                placeholder="What you'll say to camera…"
                className="mt-1 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void avatarAction("preview")}
                disabled={avBusy !== null || !avScript.trim()}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {avBusy === "preview" ? "Synthesizing…" : "Preview voice (free)"}
              </button>
              <button
                type="button"
                onClick={() => void avatarAction("render")}
                disabled={avBusy !== null || !avAudioPath}
                title={avAudioPath ? "Render the talking-avatar video" : "Preview the voice first"}
                className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {avBusy === "render" ? "Rendering… (1–2 min)" : "Generate video (uses credits)"}
              </button>
            </div>

            {avAudioUrl ? (
              <audio controls src={avAudioUrl} className="mt-1 w-full max-w-md">
                <track kind="captions" />
              </audio>
            ) : null}

            {av.videoUrl ? (
              <div className="space-y-1">
                <video controls src={av.videoUrl} className="mt-1 w-full max-w-md rounded-lg border border-slate-200" />
                <a href={av.videoUrl} download className="text-[12px] font-medium text-violet-700 hover:underline">
                  Download video
                </a>
              </div>
            ) : null}
          </>
        ) : null}

        {avError ? <p className="text-[12px] text-rose-700">{avError}</p> : null}
      </div>
    </div>
  );
}
