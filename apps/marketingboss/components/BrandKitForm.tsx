"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { BrandKit } from "@/lib/brandKit";

/**
 * Brand Kit editor (Settings › Brand). Saves the user's brand memory — name,
 * voice, audience, colors, logo — which the draft API folds into every AI post
 * so copy and image/video prompts come out on-brand.
 */
type ResearchedProfile = {
  name: string | null;
  summary: string | null;
  audience: string | null;
  topicPresets: string[];
  brand?: { brand_name: string | null; voice: string | null; audience: string | null };
};

export default function BrandKitForm({ uid, initial }: { uid: string; initial: BrandKit | null }) {
  const [brandName, setBrandName] = useState(initial?.brand_name ?? "");
  const [voice, setVoice] = useState(initial?.voice ?? "");
  const [audience, setAudience] = useState(initial?.audience ?? "");
  const [primary, setPrimary] = useState(initial?.primary_color ?? "#7c5cff");
  const [accent, setAccent] = useState(initial?.accent_color ?? "#f5b301");
  const [logoUrl, setLogoUrl] = useState(initial?.logo_url ?? "");
  const [companyUrl, setCompanyUrl] = useState(initial?.company_url ?? "");
  const [researching, setResearching] = useState(false);
  /**
   * Fill the same fields from a video of the owner speaking. Someone who talks
   * to camera has already stated their positioning out loud; asking them to
   * retype it as "tone of voice" is asking twice.
   */
  const [reading, setReading] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const [researched, setResearched] = useState<ResearchedProfile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function fillFromVideo(file: File) {
    if (reading) return;
    setReading(true);
    setError(null);
    setNote(null);
    setHeard(null);
    try {
      const supabase = createClient();
      const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
      const path = `${uid}/brand/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("media")
        .upload(path, file, { contentType: file.type || "video/mp4", upsert: false });
      if (upErr) throw upErr;
      const mediaUrl = supabase.storage.from("media").getPublicUrl(path).data.publicUrl;

      const res = await fetch("/api/brand-kit/from-video", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mediaUrl }),
      });
      const b = (await res.json().catch(() => null)) as
        | { ok?: boolean; brandName?: string; voice?: string; audience?: string; transcript?: string; error?: string }
        | null;
      if (!res.ok || !b?.ok) throw new Error(b?.error || "Couldn't read that video.");

      // Fill only empty fields — the same rule the website path follows. A
      // Brand Kit someone has already written is not overwritten by one clip.
      if (!brandName.trim() && b.brandName) setBrandName(b.brandName);
      if (!voice.trim() && b.voice) setVoice(b.voice);
      if (!audience.trim() && b.audience) setAudience(b.audience);
      setHeard(b.transcript ?? null);
      setNote("Filled from what you said — review it, then Save.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that video.");
    } finally {
      setReading(false);
      if (videoInput.current) videoInput.current.value = "";
    }
  }

  async function fillFromWebsite() {
    const url = companyUrl.trim();
    if (!url || researching) return;
    setResearching(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/business-profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const b = (await res.json().catch(() => null)) as { ok?: boolean; profile?: ResearchedProfile; error?: string } | null;
      if (!res.ok || !b?.profile) throw new Error(b?.error || "The research ran long or failed — please try again.");
      setResearched(b.profile);
      // Fill only fields the user hasn't typed — same rule as the server.
      const brand = b.profile.brand;
      if (!brandName.trim() && (brand?.brand_name || b.profile.name)) setBrandName(brand?.brand_name || b.profile.name || "");
      if (!voice.trim() && (brand?.voice || b.profile.summary)) setVoice(brand?.voice || b.profile.summary || "");
      if (!audience.trim() && (brand?.audience || b.profile.audience)) setAudience(brand?.audience || b.profile.audience || "");
      setNote("Business info filled from your website and saved — review or tweak anytime.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't research that site — please try again.");
    } finally {
      setResearching(false);
    }
  }

  async function onPickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${uid}/brand/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("media")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      setLogoUrl(supabase.storage.from("media").getPublicUrl(path).data.publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/brand-kit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          brand_name: brandName,
          voice,
          audience,
          primary_color: primary,
          accent_color: accent,
          logo_url: logoUrl,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Couldn't save your brand kit.");
        return;
      }
      setNote("Saved — new posts will use your brand.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setSaving(false);
    }
  }

  const field = "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-boss-violet/60";

  return (
    <section className="flex flex-col gap-4">
      <p className="text-sm text-slate-500">
        Tell MarketingBoss about your brand once — it&apos;s woven into every AI caption and image prompt so your
        content stays on-brand automatically.
      </p>

      {/* Fastest path: research the company site and fill the kit from it. */}
      <div className="rounded-2xl border border-boss-violet/20 bg-boss-violet/5 p-4">
        <span className="text-xs font-medium text-slate-600">Company website</span>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input
            type="url"
            value={companyUrl}
            onChange={(e) => setCompanyUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void fillFromWebsite()}
            placeholder="https://your-company.com"
            className="min-w-[220px] flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-boss-violet/60"
          />
          <button
            type="button"
            onClick={() => void fillFromWebsite()}
            disabled={researching || !companyUrl.trim()}
            className="rounded-lg bg-boss-violet px-3.5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
          >
            {researching ? "Researching…" : "Fill from website"}
          </button>
        </div>
        {researching && (
          <p className="mt-1.5 text-xs text-slate-500">
            Reading your site, filling your brand info, and generating post topics — this can take a minute or two.
          </p>
        )}

        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">
              Or use a video of yourself talking — 20 seconds is enough:
            </span>
            <button
              type="button"
              onClick={() => videoInput.current?.click()}
              disabled={reading}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:text-slate-900 disabled:opacity-40"
            >
              {reading ? "Listening…" : "🎤 Fill from a video"}
            </button>
            <input
              ref={videoInput}
              type="file"
              accept="video/*,audio/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void fillFromVideo(f);
              }}
              className="hidden"
            />
          </div>
          {heard && (
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              <span className="font-medium text-slate-600">Heard:</span> &ldquo;
              {heard.slice(0, 220)}
              {heard.length > 220 ? "…" : ""}&rdquo;
            </p>
          )}
        </div>
        {researched && !researching && (
          <p className="mt-1.5 text-xs text-slate-600">
            {researched.summary}
            {researched.topicPresets.length > 0 && (
              <span className="mt-1 block text-boss-violet">
                ✨ {researched.topicPresets.length} post topics generated for your business — they&apos;re in your
                posting schedule&apos;s Available box (Playbooks → Weekly post schedule).
              </span>
            )}
          </p>
        )}
      </div>

      <label className="block">
        <span className="text-xs font-medium text-slate-600">Brand / business name</span>
        <input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="e.g. Sugar Land Realty" className={field} />
      </label>

      <label className="block">
        <span className="text-xs font-medium text-slate-600">Brand voice &amp; what you do</span>
        <textarea
          value={voice}
          onChange={(e) => setVoice(e.target.value)}
          rows={3}
          placeholder="How should your brand sound, and what do you offer? e.g. 'Friendly, upbeat local realtor helping first-time buyers in Fort Bend County.'"
          className={`${field} resize-y`}
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium text-slate-600">Target audience</span>
        <input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="e.g. First-time homebuyers, 28–45" className={field} />
      </label>

      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-600">Primary color</span>
          <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-slate-200" />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-600">Accent color</span>
          <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-slate-200" />
        </label>
      </div>

      <div>
        <span className="text-xs font-medium text-slate-600">Logo</span>
        <div className="mt-1 flex items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Brand logo" className="size-14 rounded-xl border border-slate-200 object-contain p-1" />
          ) : (
            <div className="grid size-14 place-items-center rounded-xl border border-dashed border-slate-300 text-[10px] text-slate-400">
              No logo
            </div>
          )}
          <label className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
            {uploading ? "Uploading…" : logoUrl ? "Replace logo" : "Upload logo"}
            <input type="file" accept="image/*" onChange={onPickLogo} className="hidden" disabled={uploading} />
          </label>
          {logoUrl && (
            <button type="button" onClick={() => setLogoUrl("")} className="text-xs text-slate-400 hover:text-slate-700">
              Remove
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-xl bg-boss-gold px-5 py-2.5 text-sm font-semibold text-black transition hover:brightness-105 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save brand kit"}
        </button>
        {note && <span className="text-sm text-emerald-600">{note}</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </section>
  );
}
