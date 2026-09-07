"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { uploadViaStorage } from "@/lib/uploads/uploadViaStorage";
import { extractVoiceSample } from "@/lib/audio/extractVoiceSample";
import { AVATAR_PRESET_VOICES, CLONE_VOICE_ID } from "@/lib/agent/avatarVoices";
import { GateReason } from "@/components/ui/GateReason";

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
  hasPortrait: boolean;
  voiceReady: boolean;
  script: string | null;
  videoUrl: string | null;
};

/** A queued or in-flight render. `status` mirrors avatar_render_jobs.status. */
type AvatarJob = {
  id: string;
  status: "queued" | "rendering" | "upscaling" | "done" | "failed";
  videoUrl?: string | null;
  error?: string | null;
  sharpen?: boolean;
};

type AvatarResp = Partial<AvatarState> & {
  ok?: boolean;
  error?: string | null;
  audioUrl?: string;
  audioPath?: string;
  scheduled?: number;
  premiumAvatar?: boolean;
  sharpened?: boolean;
  job?: AvatarJob | null;
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
  const { t, i18n } = useTranslation("dashboard");
  const [configured, setConfigured] = useState(true);
  const [status, setStatus] = useState<string>("idle");
  const [consent, setConsent] = useState(false);
  const [hasVideo, setHasVideo] = useState(false);
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [hasPortrait, setHasPortrait] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);
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
  /**
   * Language for everything this panel generates — the brand profile and the
   * avatar script. Derived from the header language toggle rather than being
   * its own control: one place to set language, not three. Switch the header
   * to 中文 and rebuild to get Chinese output.
   */
  const avLang: "en" | "zh-Hans" = i18n.language === "zh-Hans" ? "zh-Hans" : "en";
  const [avTopic, setAvTopic] = useState("");
  const [avScript, setAvScript] = useState("");
  const [avAudioUrl, setAvAudioUrl] = useState<string | null>(null);
  const [avAudioPath, setAvAudioPath] = useState<string | null>(null);
  const [avBusy, setAvBusy] = useState<string | null>(null);
  const [avError, setAvError] = useState<string | null>(null);
  const [avCaption, setAvCaption] = useState("");
  const [avPublishMsg, setAvPublishMsg] = useState<string | null>(null);
  const [avNeedsConnect, setAvNeedsConnect] = useState(false);
  // Premium "Sharper video" enhancement — gated to Premium+ plans.
  const [avPremium, setAvPremium] = useState(false);
  const [avSharpen, setAvSharpen] = useState(false);
  const [avPhotoAvatar, setAvPhotoAvatar] = useState(false);
  // Which voice speaks the script. Defaults to the agent's clone; a stock
  // preset lets them make content without cloning, or in a different voice.
  const [avVoice, setAvVoice] = useState<string>(CLONE_VOICE_ID);
  // Set once the agent picks a voice themselves. Until then loadAvatar keeps the
  // selection in sync with clone readiness; after, their choice is never
  // overridden by a background refresh.
  const voiceTouched = useRef(false);
  // The background render. Rendering happens server-side now, so this is the
  // only thing tying the page to a job it no longer owns — closing the tab
  // doesn't cancel it, and the agent is notified either way.
  const [avJob, setAvJob] = useState<AvatarJob | null>(null);
  const [vcClean, setVcClean] = useState(false);

  async function publishAvatar() {
    setAvBusy("publish");
    setAvError(null);
    setAvPublishMsg(null);
    setAvNeedsConnect(false);
    try {
      const res = await fetch("/api/dashboard/avatar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "publish", caption: avCaption.trim() || undefined }),
      });
      const b = (await res.json().catch(() => ({}))) as AvatarResp;
      if (!res.ok || !b.ok) {
        setAvError(b.error ?? t("twin.errors.postFailed"));
        return;
      }
      if ((b.scheduled ?? 0) > 0) {
        setAvPublishMsg(t("twin.queued", { count: b.scheduled }));
      } else {
        setAvNeedsConnect(true);
        setAvPublishMsg(b.error ?? t("twin.errors.noAccounts"));
      }
    } catch (e) {
      setAvError(e instanceof Error ? e.message : t("twin.errors.network"));
    } finally {
      setAvBusy(null);
    }
  }

  async function loadAvatar() {
    try {
      const res = await fetch("/api/dashboard/avatar");
      const b = (await res.json().catch(() => ({}))) as AvatarResp;
      if (b.ok) {
        /*
         * Until the agent picks a voice themselves, the selection FOLLOWS clone
         * readiness — in both directions. The first version of this only ever
         * downgraded to a preset when no clone existed, and never came back: an
         * agent whose clone failed and then succeeded kept silently previewing
         * in a stock voice while the clone sat there ready.
         */
        if (!voiceTouched.current) {
          setAvVoice(b.voiceReady ? CLONE_VOICE_ID : (AVATAR_PRESET_VOICES[0]?.id ?? CLONE_VOICE_ID));
        }
        setAv({
          configured: Boolean(b.configured),
          hasIntroVideo: Boolean(b.hasIntroVideo),
          hasPortrait: Boolean(b.hasPortrait),
          voiceReady: Boolean(b.voiceReady),
          script: b.script ?? null,
          videoUrl: b.videoUrl ?? null,
        });
        if (b.script) setAvScript(b.script);
        setAvPremium(Boolean(b.premiumAvatar));
        setAvJob(b.job ?? null);
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
            ? { action, topic: avTopic, language: avLang }
            : action === "render"
              ? {
                  action,
                  text: avScript,
                  audioPath: avAudioPath,
                  voice: avVoice,
                  sharpen: avPremium && avSharpen,
                  photoAvatar: avPremium && avPhotoAvatar,
                }
              : { action, text: avScript, audioPath: avAudioPath, voice: avVoice },
        ),
      });
      const b = (await res.json().catch(() => ({}))) as AvatarResp;
      if (!res.ok || !b.ok) {
        setAvError(b.error ?? t("twin.errors.generic"));
        return;
      }
      if (action === "draft" && b.script) setAvScript(b.script);
      if (action === "preview") {
        setAvAudioUrl(b.audioUrl ?? null);
        setAvAudioPath(b.audioPath ?? null);
      }
      // Render no longer returns a video — it returns a queued job. Adopt it so
      // the poll below starts immediately rather than after the next refresh.
      if (action === "render" && b.job) setAvJob(b.job);
    } catch (e) {
      setAvError(e instanceof Error ? e.message : t("twin.errors.network"));
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
        setVcError(b.error ?? t("twin.errors.generic"));
        // Refresh so a failed clone shows its stored status/error.
        await loadVoice();
        return;
      }
      setVc(toVoiceState(b));
      // A newly-ready clone unlocks the avatar section — refresh it without a reload.
      await loadAvatar();
    } catch (e) {
      setVcError(e instanceof Error ? e.message : t("twin.errors.network"));
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
          hasPortrait?: boolean;
          profile?: Profile | null;
        };
        if (!b.ok) return;
        setConfigured(b.configured ?? true);
        setStatus(b.status ?? "idle");
        setConsent(Boolean(b.consent));
        setHasVideo(Boolean(b.hasVideo));
        setHasPortrait(Boolean(b.hasPortrait));
        if (b.profile) setProfile({ ...EMPTY, ...b.profile });
      } catch {
        /* best-effort */
      }
      await loadVoice();
      await loadAvatar();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * Follow a render that's running on the server. This is a convenience, not
   * the delivery mechanism — the job completes and notifies whether or not this
   * page is open, so the poll only exists to update the panel live for someone
   * who stayed. Stops the moment the job reaches a terminal state.
   */
  const jobActive =
    avJob?.status === "queued" || avJob?.status === "rendering" || avJob?.status === "upscaling";
  useEffect(() => {
    if (!jobActive) return;
    const timer = setInterval(() => void loadAvatar(), 8000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobActive]);

  async function onPickVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || uploading) return;
    if (!file.type.startsWith("video/")) return setError(t("twin.errors.chooseVideo"));
    setError(null);
    setUploading(true);
    try {
      const path = await uploadViaStorage(file, "agent_intro_video");
      setVideoPath(path);
      setHasVideo(true);
      setNote(t("twin.videoUploaded"));

      /*
       * Also send up just the audio, for voice cloning. ElevenLabs caps uploads
       * at 11MB and an intro video is typically ~18MB, so the sample used to be
       * squeezed under the cap by a denoiser — which reshaped the cloned voice.
       * A minute of speech extracts to ~1-2MB, unprocessed.
       *
       * Best-effort and after the video is safely stored: a browser that can't
       * decode the container must not cost the agent their upload. The server
       * falls back to the video when this is missing.
       */
      try {
        const audio = await extractVoiceSample(file);
        const audioPath = await uploadViaStorage(audio, "agent_intro_audio");
        await fetch("/api/dashboard/digital-twin", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ introAudioPath: audioPath }),
        });
      } catch (audioErr) {
        console.warn("[twin] audio extraction skipped:", audioErr instanceof Error ? audioErr.message : audioErr);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("twin.errors.uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  /**
   * A photo is an alternative likeness source for the Lifelike avatar, so the
   * camera-shy aren't locked out of it. It goes up under the same consent gate
   * as the intro video — the server re-checks, this is just the friendly stop.
   */
  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || photoUploading) return;
    if (!file.type.startsWith("image/")) return setError(t("twin.errors.chooseImage"));
    if (!consent) return setError(t("twin.errors.consentFirst"));
    setError(null);
    setPhotoUploading(true);
    try {
      const path = await uploadViaStorage(file, "agent_portrait");
      const res = await fetch("/api/dashboard/digital-twin", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ portraitPath: path, consent: true }),
      });
      const b = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !b.ok) {
        setError(b.error ?? t("twin.errors.savePhotoFailed"));
        return;
      }
      setHasPortrait(true);
      setAv((prev) => (prev ? { ...prev, hasPortrait: true } : prev));
      setNote(t("twin.photoSaved"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("twin.errors.uploadFailed"));
    } finally {
      setPhotoUploading(false);
    }
  }

  async function build() {
    if (building) return;
    if (!consent) return setError(t("twin.errors.consentFirst"));
    if (!videoPath) return setError(t("twin.errors.uploadIntroFirst"));
    setBuilding(true);
    setError(null);
    setNote(t("twin.transcribing"));
    try {
      const res = await fetch("/api/dashboard/digital-twin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ videoPath, consent: true, language: avLang }),
      });
      const b = (await res.json().catch(() => ({}))) as { ok?: boolean; profile?: Profile; error?: string };
      if (!res.ok || !b.ok || !b.profile) {
        setError(b.error ?? t("twin.errors.buildFailed"));
        setNote(null);
        return;
      }
      setProfile({ ...EMPTY, ...b.profile });
      setStatus("ready");
      setNote(t("twin.profileReady"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("twin.errors.network"));
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
      if (!res.ok || !b.ok) setError(b.error ?? t("twin.errors.saveFailed"));
      else setNote(t("twin.errors.saved"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("twin.errors.network"));
    } finally {
      setSaving(false);
    }
  }

  const field = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">{t("twin.heading")}</h2>
      <p className="mt-0.5 text-sm text-slate-500">
        {t("twin.intro")}
      </p>

      {!configured ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          {t("pages.digitalTwin.notEnabledBefore")} <code>FAL_KEY</code> + <code>ANTHROPIC_API_KEY</code>{t("pages.digitalTwin.notEnabledAfter")}
        </p>
      ) : null}

      {/* Consent */}
      <label className="mt-4 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
        <span className="text-[12px] text-slate-700">
          {t("twin.consent")}
        </span>
      </label>

      {/* Upload + build */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || !consent}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          title={consent ? t("twin.uploadIntroTitle") : t("twin.consentFirst")}
        >
          {uploading ? t("common:status.uploading") : hasVideo ? t("twin.replaceIntro") : t("twin.uploadIntro")}
        </button>
        <GateReason reason={!consent ? t("twin.consentFirst") : null} />
        <input ref={fileRef} type="file" accept="video/*" onChange={onPickVideo} className="hidden" />
        <button
          type="button"
          onClick={() => photoRef.current?.click()}
          disabled={photoUploading || !consent}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          title={consent ? t("twin.usePhotoTitle") : t("twin.consentFirst")}
        >
          {photoUploading ? t("common:status.uploading") : hasPortrait ? t("twin.replacePhoto") : t("twin.usePhoto")}
        </button>
        <GateReason reason={!consent ? t("twin.consentFirst") : null} />
        <input ref={photoRef} type="file" accept="image/*" onChange={onPickPhoto} className="hidden" />
        <button
          type="button"
          onClick={() => void build()}
          disabled={building || !consent || (!videoPath && !hasVideo)}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {building ? t("twin.building") : status === "ready" ? t("twin.rebuildProfile") : t("twin.buildProfile")}
        </button>
        {status === "processing" ? <span className="text-[11px] text-slate-500">{t("twin.processing")}</span> : null}
      </div>

      {/* Not a control — just says which language the generated copy comes
          out in, since the only place to change it is the header toggle. */}
      <p className="mt-2 text-[11px] text-slate-500">{t("twin.languageNote")}</p>
      {note ? <p className="mt-2 text-[12px] text-slate-600">{note}</p> : null}
      {error ? <p className="mt-2 text-[12px] text-rose-700">{error}</p> : null}

      {/* Profile (editable) */}
      {(status === "ready" || profile.bio || profile.tagline) && (
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">{t("twin.bio")}</span>
            <textarea value={profile.bio} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} rows={3} className={`${field} resize-y`} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">{t("twin.market")}</span>
              <input value={profile.market} onChange={(e) => setProfile({ ...profile, market: e.target.value })} className={field} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">{t("twin.tone")}</span>
              <input value={profile.tone} onChange={(e) => setProfile({ ...profile, tone: e.target.value })} className={field} />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">{t("twin.specialties")}</span>
            <textarea
              value={profile.specialties.join("\n")}
              onChange={(e) => setProfile({ ...profile, specialties: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 6) })}
              rows={3}
              className={`${field} resize-y`}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">{t("twin.tagline")}</span>
            <input value={profile.tagline} onChange={(e) => setProfile({ ...profile, tagline: e.target.value })} className={field} />
          </label>
          <div className="flex justify-end">
            <button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg bg-[#0072ce] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#005ca8] disabled:opacity-50">
              {saving ? t("common:status.saving") : t("twin.saveProfile")}
            </button>
          </div>
        </div>
      )}

      {/* Phase B — voice clone */}
      <div className="mt-5 space-y-3 border-t border-slate-100 pt-5">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-900">{t("twin.aiVoice")}</h3>
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700">{t("pages.digitalTwin.beta")}</span>
        </div>
        <p className="text-[12px] text-slate-500">
          {t("twin.voiceIntro")}
        </p>

        {vc && !vc.configured ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            {t("pages.digitalTwin.notEnabledBefore")} <code>ELEVENLABS_API_KEY</code>{t("pages.digitalTwin.notEnabledAfter")}
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
            {t("twin.voiceConsent")}
          </span>
        </label>

        {vc && vc.consent && !vc.hasIntroVideo ? (
          <p className="text-[12px] text-slate-500">{t("twin.buildFirst")}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void voiceAction("start", { clean: avPremium && vcClean })}
            disabled={vcBusy !== null || !vc?.configured || !vc?.consent || !vc?.hasIntroVideo}
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            title={!vc?.consent ? t("twin.cloneVoiceTitle") : !vc?.hasIntroVideo ? t("twin.recordFirst") : t("twin.cloneVoice")}
          >
            {vcBusy === "start"
              ? t("twin.cloning")
              : vc?.hasClone
                ? t("twin.recloneVoice")
                : t("twin.cloneVoice")}
          </button>
          <GateReason reason={!vc?.consent ? t("twin.cloneVoiceTitle") : null} />

          <label className={`mt-2 flex items-center gap-2 text-xs ${avPremium ? "text-slate-700" : "text-slate-500"}`}>
            <input
              type="checkbox"
              checked={avPremium && vcClean}
              disabled={!avPremium || vcBusy !== null}
              onChange={(e) => setVcClean(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-violet-600 disabled:opacity-50"
            />
            <span className="inline-flex flex-wrap items-center gap-1">
              🎙️ {t("twin.cleanVoice")}
              <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">{t("twin.premium")}</span>
              {avPremium ? (
                <span className="text-slate-500">{t("twin.cleanVoiceHelp")}</span>
              ) : (
                <a href="/dashboard/billing" className="text-violet-600 underline underline-offset-2">{t("pages.digitalTwin.upgradeToUnlock")}</a>
              )}
            </span>
          </label>

          {vc?.status === "ready" && vc.hasClone ? (
            <span className="text-[12px] font-medium text-emerald-700">{t("twin.voiceReady")}</span>
          ) : vc?.status === "processing" ? (
            <span className="text-[12px] text-slate-500">{t("twin.processing")}</span>
          ) : vc?.status === "failed" ? (
            <span className="text-[12px] text-rose-700">
              {t("twin.cloneFailed")}
              {/* The reason is persisted in voice_clone_error but was never shown,
                  so a failed clone read as a dead end with nothing to act on. */}
              {vc?.error ? <span className="text-slate-500"> — {vc.error}</span> : null}
            </span>
          ) : null}
        </div>

        {/*
          Activate-on-calls only. The "this is my voice — confirm" button used to
          live here too, but confirming a voice you have no way to HEAR from this
          spot is a guess: the only playback is the avatar studio's Preview. It
          now sits next to that button, so listen-then-confirm is one motion.
        */}
        {vc?.status === "ready" && vc.hasClone && vc.acknowledged ? (
          <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={vc.useClonedVoice}
                disabled={vcBusy !== null}
                onChange={(e) => void voiceAction("activate", { on: e.target.checked })}
              />
              <span className="text-slate-700">{t("twin.answerCalls")}</span>
            </label>
          </div>
        ) : null}

        {/* Only the current session's attempt shows the full error — a reload clears it.
            (A stored failure still shows the compact "Clone failed" label by the button.) */}
        {vcError ? <p className="text-[12px] text-rose-700">{vcError}</p> : null}
      </div>

      {/* Phase C — talking avatar */}
      <div className="mt-5 space-y-3 border-t border-slate-100 pt-5">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-900">{t("twin.avatarVideo")}</h3>
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700">{t("pages.digitalTwin.beta")}</span>
        </div>
        <p className="text-[12px] text-slate-500">
          {t("twin.avatarIntro")}
        </p>
        {av?.hasPortrait ? (
          <p className="text-[12px] text-slate-500">
            {t("twin.portraitNote", { mode: t("twin.lifelikeAvatar") })}
          </p>
        ) : null}

        {av && !av.configured ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            {t("pages.digitalTwin.notEnabledBefore")} <code>FAL_KEY</code> + <code>ELEVENLABS_API_KEY</code>{t("pages.digitalTwin.notEnabledAfter")}
          </p>
        ) : av && !av.hasIntroVideo && !av.hasPortrait ? (
          /* The face is the hard requirement, not the voice — a stock voice can
             speak the script, but nothing can stand in for the agent's likeness. */
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600">{t("pages.digitalTwin.needFaceFirst")}</p>
        ) : av ? (
          <>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex-1 min-w-[200px]">
                <span className="text-xs font-medium text-slate-600">{t("twin.topic")}</span>
                <input
                  value={avTopic}
                  onChange={(e) => setAvTopic(e.target.value)}
                  placeholder={t("twin.topicPlaceholder")}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </label>
              {/* Language lives once, in the build row above — see the note there. */}
              <button
                type="button"
                onClick={() => void avatarAction("draft")}
                disabled={avBusy !== null}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {avBusy === "draft" ? t("common:status.writing") : t("twin.draftScript")}
              </button>
            </div>

            <label className="block">
              <span className="text-xs font-medium text-slate-600">{t("twin.script")}</span>
              <textarea
                value={avScript}
                onChange={(e) => {
                  setAvScript(e.target.value);
                  // Editing the script invalidates a prior voice preview.
                  setAvAudioUrl(null);
                  setAvAudioPath(null);
                }}
                rows={4}
                placeholder={t("twin.scriptPlaceholder")}
                className="mt-1 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-slate-600">{t("twin.voice")}</span>
              <select
                value={avVoice}
                onChange={(e) => {
                  voiceTouched.current = true;
                  setAvVoice(e.target.value);
                  // Switching voice invalidates a prior preview for the same
                  // reason editing the script does — it's no longer what you heard.
                  setAvAudioUrl(null);
                  setAvAudioPath(null);
                }}
                disabled={avBusy !== null}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-50"
              >
                <option value={CLONE_VOICE_ID} disabled={!av.voiceReady}>
                  {av.voiceReady ? t("twin.clonedVoice") : t("twin.clonedVoiceLocked")}
                </option>
                {AVATAR_PRESET_VOICES.map((v) => (
                  <option key={v.id} value={v.id}>{`${v.label} — ${v.hint}`}</option>
                ))}
              </select>
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void avatarAction("preview")}
                disabled={avBusy !== null || !avScript.trim()}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {avBusy === "preview" ? t("common:status.synthesizing") : t("twin.previewVoice")}
              </button>
              {/*
                Sits right after Preview on purpose: this is the only place the
                agent can actually hear their clone, so confirming it is theirs
                belongs next to the play button, not in a separate section.
                Disappears once confirmed, which then reveals the
                "answer calls in my voice" toggle above.
              */}
              {vc?.status === "ready" && vc.hasClone && !vc.acknowledged ? (
                <button
                  type="button"
                  onClick={() => void voiceAction("acknowledge")}
                  disabled={vcBusy !== null}
                  className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                >
                  {vcBusy === "acknowledge" ? t("common:status.saving") : t("twin.confirmVoice")}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void avatarAction("render")}
                disabled={avBusy !== null || !avAudioPath || jobActive}
                title={avAudioPath ? t("twin.renderTitle") : t("twin.previewFirst")}
                className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {avBusy === "render" ? t("common:status.queueing") : t("pages.digitalTwin.generateVideoUsesCredits")}
              </button>
            </div>

            {/*
              The render runs on the server now, so this is a progress report on
              something we no longer own — deliberately says the tab can be
              closed, because the whole point of the change is that it can be.
            */}
            {jobActive ? (
              <div className="flex items-start gap-3 rounded-lg border border-violet-200 bg-violet-50 p-3">
                <span
                  aria-hidden
                  className="mt-1 size-3 shrink-0 animate-pulse rounded-full bg-violet-500"
                />
                <p className="text-[12px] leading-relaxed text-violet-900">
                  <strong>
                    {avJob?.status === "upscaling"
                      ? t("pages.digitalTwin.renderSharpening")
                      : t("pages.digitalTwin.renderRendering")}
                  </strong>{" "}
                  {t("pages.digitalTwin.renderDuration")}
                  {avJob?.sharpen ? t("pages.digitalTwin.renderDurationSharper") : ""}
                  {t("pages.digitalTwin.renderCloseHint")}
                </p>
              </div>
            ) : null}

            {avJob?.status === "failed" ? (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-800">
                {avJob.error ?? t("pages.digitalTwin.renderFailed")}{" "}
                {t("pages.digitalTwin.renderCreditsReturned")}
              </p>
            ) : null}

            {/*
              Render stays gated on an approved preview so nobody spends credits
              on a take they haven't heard — but a disabled button with only a
              hover tooltip reads as "broken". Say why, on screen.
            */}
            {!avAudioPath && avBusy === null ? (
              <p className="text-[12px] text-slate-500">
                {avScript.trim()
                  ? t("pages.digitalTwin.hitPreviewVoiceFree")
                  : t("pages.digitalTwin.draftOrWriteA")}
              </p>
            ) : null}

            {/* Premium enhancement — gated to Premium+ plans; opt-in per render. */}
            <label className={`flex items-center gap-2 text-xs ${avPremium ? "text-slate-700" : "text-slate-500"}`}>
              <input
                type="checkbox"
                checked={avPremium && avSharpen}
                disabled={!avPremium || avBusy !== null}
                onChange={(e) => setAvSharpen(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-violet-600 disabled:opacity-50"
              />
              <span className="inline-flex flex-wrap items-center gap-1">
                {t("pages.digitalTwin.sharperVideo")}
                <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">{t("twin.premium")}</span>
                {avPremium ? (
                  <span className="text-slate-500">— upscales &amp; restores the render</span>
                ) : (
                  <a href="/dashboard/billing" className="text-violet-600 underline underline-offset-2">{t("pages.digitalTwin.upgradeToUnlock")}</a>
                )}
              </span>
            </label>

            <label className={`flex items-center gap-2 text-xs ${avPremium ? "text-slate-700" : "text-slate-500"}`}>
              <input
                type="checkbox"
                checked={avPremium && avPhotoAvatar}
                disabled={!avPremium || avBusy !== null}
                onChange={(e) => setAvPhotoAvatar(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-violet-600 disabled:opacity-50"
              />
              <span className="inline-flex flex-wrap items-center gap-1">
                {t("pages.digitalTwin.lifelikeAvatar")}
                <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">{t("twin.premium")}</span>
                {avPremium ? (
                  <span className="text-slate-500">— photo-to-avatar with head motion (vs lip-sync)</span>
                ) : (
                  <a href="/dashboard/billing" className="text-violet-600 underline underline-offset-2">{t("pages.digitalTwin.upgradeToUnlock")}</a>
                )}
              </span>
            </label>

            {avAudioUrl ? (
              <audio controls src={avAudioUrl} className="mt-1 w-full max-w-md">
                <track kind="captions" />
              </audio>
            ) : null}

            {av.videoUrl ? (
              <div className="space-y-2">
                <video controls src={av.videoUrl} className="mt-1 w-full max-w-md rounded-lg border border-slate-200" />
                <div className="flex items-center gap-3">
                  <a href={av.videoUrl} download className="text-[12px] font-medium text-violet-700 hover:underline">{t("pages.digitalTwin.downloadVideo")}</a>
                </div>

                {/* Post straight to social */}
                <div className="mt-1 space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">{t("twin.caption")}</span>
                    <textarea
                      value={avCaption}
                      onChange={(e) => setAvCaption(e.target.value)}
                      rows={2}
                      placeholder={t("twin.captionPlaceholder")}
                      className="mt-1 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void publishAvatar()}
                      disabled={avBusy !== null}
                      className="rounded-lg bg-[#0072ce] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#005ca8] disabled:opacity-50"
                    >
                      {avBusy === "publish" ? t("common:status.posting") : t("twin.postToSocial")}
                    </button>
                    {avNeedsConnect ? (
                      <a href="/connections" className="text-[12px] font-medium text-violet-700 underline underline-offset-2">{t("pages.digitalTwin.connectAccounts")}</a>
                    ) : null}
                  </div>
                  {avPublishMsg ? (
                    <p className={`text-[12px] ${avNeedsConnect ? "text-amber-700" : "text-emerald-700"}`}>{avPublishMsg}</p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {avError ? <p className="text-[12px] text-rose-700">{avError}</p> : null}
      </div>
    </div>
  );
}
