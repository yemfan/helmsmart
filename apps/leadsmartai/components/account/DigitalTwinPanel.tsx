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
    })();
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
    </div>
  );
}
