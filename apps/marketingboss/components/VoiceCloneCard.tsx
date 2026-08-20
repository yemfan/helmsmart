"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Clone your own voice — the voice half of a digital twin.
 *
 * The ad should sound like the person whose business it is. Once a clone exists
 * on the ElevenLabs account nothing else needs wiring: the narrator picker in
 * Compose reads the account's voices, so it appears there on the next open with
 * cloned voices sorted first.
 */
export default function VoiceCloneCard({ configured }: { configured: boolean }) {
  const [supabase] = useState(() => createClient());
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [consent, setConsent] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function submit() {
    if (!file || busy) return;
    if (!name.trim()) return setError("Give the voice a name.");
    if (consent.trim().length < 10) {
      return setError("Say whose voice this is and how they agreed to it being cloned.");
    }
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Still signing in — try again in a second.");
      const ext = (file.name.split(".").pop() || "mp3").toLowerCase();
      const path = `${user.id}/voice-samples/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("media")
        .upload(path, file, { contentType: file.type || "audio/mpeg", upsert: false });
      if (upErr) throw upErr;
      const sampleUrl = supabase.storage.from("media").getPublicUrl(path).data.publicUrl;

      const res = await fetch("/api/voice-clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sampleUrl, name: name.trim(), consentNote: consent.trim() }),
      });
      const b = (await res.json().catch(() => null)) as { ok?: boolean; name?: string; error?: string } | null;
      if (!res.ok || !b?.ok) throw new Error(b?.error || "Voice cloning failed.");
      setDone(b.name || name.trim());
      setFile(null);
      setName("");
      setConsent("");
      if (input.current) input.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Voice cloning failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!configured) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h3 className="text-base font-semibold text-slate-900">🎙 Your voice</h3>
        <p className="mt-1 text-xs text-slate-500">
          Voice cloning isn&rsquo;t switched on for this workspace yet. Once it is, you can record
          yourself once and have every ad narrated in your own voice.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <h3 className="text-base font-semibold text-slate-900">🎙 Your voice</h3>
      <p className="mt-1 text-xs text-slate-500">
        Upload a recording of one person speaking and it becomes a voice you can narrate ads in.
        Around a minute of clear speech works best — a video is fine, the audio is taken from it.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
          Name it
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Michael — founder"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm normal-case text-slate-900 placeholder:text-slate-400 outline-none focus:border-boss-violet/60"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
          Recording
          <input
            ref={input}
            type="file"
            accept="audio/*,video/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-[11px] normal-case text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-[11px] file:text-slate-700"
          />
        </label>
      </div>

      <textarea
        value={consent}
        onChange={(e) => setConsent(e.target.value)}
        rows={2}
        placeholder="Whose voice is this, and how did they agree to it being cloned and used in ads?"
        className="mt-2 w-full resize-y rounded-lg border border-slate-200 bg-white p-2 text-[11px] text-slate-900 placeholder:text-slate-400 outline-none focus:border-boss-violet/60"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          onClick={() => void submit()}
          disabled={busy || !file || !name.trim() || consent.trim().length < 10}
          className="inline-flex items-center gap-2 rounded-xl bg-boss-gold px-5 py-2.5 text-sm font-semibold text-black transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Cloning…" : "Clone this voice"}
        </button>
        <span className="text-[11px] text-slate-400">Free — billed on your ElevenLabs plan, not credits.</span>
      </div>

      {done && (
        <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-[11px] leading-relaxed text-emerald-900">
          <strong>{done}</strong> is ready. Pick it under Voice when you add a voiceover to a clip.
        </p>
      )}
      {error && (
        <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 p-2 text-[11px] leading-relaxed text-rose-900">
          {error}
        </p>
      )}

      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        A cloned voice can be made to say anything, so only clone a voice you own or have written
        permission for.
      </p>
    </div>
  );
}
