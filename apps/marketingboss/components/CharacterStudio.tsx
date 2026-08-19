"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Character, CharacterDna, CharacterType, ComposedCharacter } from "@/lib/characters";

/**
 * 🎭 Character Studio — card library + guided creation.
 * Simple Mode: pick a type, describe the character, AI composes the DNA,
 * you review and save; the portrait (1 credit) becomes the identity anchor.
 */

const TYPE_META: Record<CharacterType, { emoji: string; label: string; hint: string }> = {
  human: { emoji: "👤", label: "Human", hint: "Presenters, experts, customers, creators." },
  animal: { emoji: "🐶", label: "Animal", hint: "Real or anthropomorphic — a cat realtor works." },
  robot: { emoji: "🤖", label: "Robot", hint: "AI assistants and futuristic brand bots." },
  creature: { emoji: "👾", label: "Creature", hint: "Fantasy characters with personality." },
  mascot: { emoji: "🎭", label: "Mascot", hint: "Your brand's reusable face." },
};

function dnaChips(dna: CharacterDna): string[] {
  return [dna.personality?.traits, dna.personality?.communicationStyle, dna.style?.visualStyle]
    .filter((v): v is string => !!v && !!v.trim())
    .flatMap((v) => v.split(",").map((s) => s.trim()))
    .filter(Boolean)
    .slice(0, 3);
}

export default function CharacterStudio({ initial, aiConfigured }: { initial: Character[]; aiConfigured: boolean }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [step, setStep] = useState<"type" | "describe" | "review">("type");
  const [type, setType] = useState<CharacterType>("human");
  const [description, setDescription] = useState("");
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState<ComposedCharacter | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftRole, setDraftRole] = useState("");
  const [draftCollection, setDraftCollection] = useState("");
  const [saving, setSaving] = useState(false);
  /**
   * An optional reference picture chosen DURING creation. A character used to be
   * born with nothing to look at, so the presenter picker hid it until someone
   * came back and added one — the first run of the feature dead-ended.
   */
  const [draftRef, setDraftRef] = useState<File | null>(null);
  const [draftRealPerson, setDraftRealPerson] = useState(false);
  const [draftConsent, setDraftConsent] = useState("");
  const draftRefInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [supabase] = useState(() => createClient());
  /** Which card has the "use a photo" panel open, plus its pending input. */
  const [photoFor, setPhotoFor] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [consent, setConsent] = useState("");
  /** Only meaningful for a `human` character — a mascot cannot be a real person. */
  const [isRealPerson, setIsRealPerson] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<CharacterType | "">("");

  const collections = useMemo(() => [...new Set(initial.map((c) => c.collection).filter(Boolean))] as string[], [initial]);
  const [collectionFilter, setCollectionFilter] = useState("");

  const shown = initial.filter((c) => {
    if (typeFilter && c.type !== typeFilter) return false;
    if (collectionFilter && c.collection !== collectionFilter) return false;
    if (q.trim()) {
      const hay = `${c.name} ${c.role ?? ""} ${c.prompt_profile ?? ""}`.toLowerCase();
      if (!hay.includes(q.trim().toLowerCase())) return false;
    }
    return true;
  });

  function resetWizard() {
    setCreating(false);
    setStep("type");
    setDescription("");
    setDraft(null);
    setDraftRef(null);
    setDraftRealPerson(false);
    setDraftConsent("");
    setError(null);
  }

  async function compose() {
    if (composing || !description.trim()) return;
    setComposing(true);
    setError(null);
    try {
      const res = await fetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "ai", type, description: description.trim() }),
      });
      const b = (await res.json().catch(() => null)) as { ok?: boolean; composed?: ComposedCharacter; error?: string } | null;
      if (!res.ok || !b?.composed) throw new Error(b?.error || "Couldn't compose the character — please try again.");
      setDraft(b.composed);
      setDraftName(b.composed.name);
      setDraftRole(b.composed.role);
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't compose the character.");
    } finally {
      setComposing(false);
    }
  }

  async function save() {
    if (saving || !draft) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "direct",
          type,
          name: draftName.trim() || draft.name,
          role: draftRole.trim() || draft.role,
          collection: draftCollection.trim() || null,
          dna: draft.dna,
        }),
      });
      const b = (await res.json().catch(() => null)) as
        | { ok?: boolean; character?: { id: string }; error?: string }
        | null;
      if (!res.ok || !b?.ok) throw new Error(b?.error || "Couldn't save the character.");
      // The reference is attached AFTER creation because the portrait endpoint
      // is keyed by character id. A failure here must not read as "nothing
      // saved" — the character exists, so say what actually went wrong and
      // leave them on the card, where the same upload is available.
      if (draftRef && b.character?.id) {
        try {
          await savePortrait(b.character.id, draftRef, {
            realPerson: draftRealPerson,
            consentNote: draftConsent.trim(),
          });
        } catch (e) {
          resetWizard();
          router.refresh();
          setError(
            `${draftName.trim() || draft.name} was created, but the reference picture didn't attach: ${
              e instanceof Error ? e.message : "unknown error"
            }. Add it from the card.`,
          );
          return;
        }
      }
      resetWizard();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the character.");
    } finally {
      setSaving(false);
    }
  }

  /**
   * Put a picture in Storage and make it the character's identity anchor.
   *
   * Shared by the creation wizard and the card, so both record the same thing:
   * only a human character can be a real person, and only then is a consent
   * note meaningful. The server re-derives this from the stored character
   * rather than trusting what we send.
   */
  async function savePortrait(
    characterId: string,
    file: File,
    opts: { realPerson: boolean; consentNote: string },
  ): Promise<void> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Still signing in — try again in a second.");
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${user.id}/characters/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("media")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) throw upErr;
    const url = supabase.storage.from("media").getPublicUrl(path).data.publicUrl;
    const res = await fetch(`/api/characters/${characterId}/portrait`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        identityType: opts.realPerson ? "real_person" : "brand_owned",
        consentNote: opts.consentNote,
      }),
    });
    const b = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!res.ok || !b?.ok) throw new Error(b?.error || "Could not save that picture.");
  }

  /**
   * Use a PHOTO as the identity anchor instead of a generated portrait.
   *
   * Verified 2026-08-19: a real head-and-shoulders photo through
   * seedance-2.0/reference-to-video produced a usable vertical ad with the
   * face, hair and wardrobe intact. Note it only works on 2.0 — 2.5 refuses
   * face references — so an uploaded human caps at 15s rather than 30s.
   *
   * Consent is required rather than assumed. The output shows a real person's
   * face saying words they never said, so the note has to name who they are and
   * that they agreed; the server enforces this too.
   */
  async function uploadPhoto(id: string) {
    const file = photoFile;
    if (!file || busy) return;
    if (!file.type.startsWith("image/")) return setError("Choose an image file.");
    if (isRealPerson && consent.trim().length < 10) {
      return setError("Say who is in the photo and how they agreed to it being used in AI ads.");
    }
    setBusy(id);
    setError(null);
    try {
      await savePortrait(id, file, { realPerson: isRealPerson, consentNote: consent.trim() });
      setPhotoFor(null);
      setPhotoFile(null);
      setConsent("");
      setIsRealPerson(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that photo.");
    } finally {
      setBusy(null);
    }
  }

  async function act(id: string, fn: () => Promise<Response>) {
    if (busy) return;
    setBusy(id);
    setError(null);
    try {
      const res = await fn();
      const b = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !b?.ok) throw new Error(b?.error || "That didn't work — please try again.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work — please try again.");
    } finally {
      setBusy(null);
    }
  }

  const fieldCls =
    "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-boss-violet/60";

  return (
    <div className="flex flex-col gap-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => (creating ? resetWizard() : setCreating(true))}
          className="rounded-xl bg-boss-gold px-5 py-2.5 text-sm font-semibold text-black transition hover:brightness-105"
        >
          {creating ? "Close" : "+ New character"}
        </button>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your cast…" className={`${fieldCls} w-48`} />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as CharacterType | "")} className={fieldCls}>
          <option value="">All types</option>
          {(Object.keys(TYPE_META) as CharacterType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_META[t].emoji} {TYPE_META[t].label}
            </option>
          ))}
        </select>
        {collections.length > 0 && (
          <select value={collectionFilter} onChange={(e) => setCollectionFilter(e.target.value)} className={fieldCls}>
            <option value="">All collections</option>
            {collections.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}

      {/* Creation wizard */}
      {creating && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          {step === "type" && (
            <>
              <h3 className="text-sm font-semibold text-slate-900">Who are we creating?</h3>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {(Object.keys(TYPE_META) as CharacterType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setType(t);
                      setStep("describe");
                    }}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center transition hover:border-boss-violet/40"
                  >
                    <div className="text-2xl">{TYPE_META[t].emoji}</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">{TYPE_META[t].label}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500">{TYPE_META[t].hint}</div>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === "describe" && (
            <>
              <h3 className="text-sm font-semibold text-slate-900">
                {TYPE_META[type].emoji} Describe your {TYPE_META[type].label.toLowerCase()}
              </h3>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder={
                  type === "human"
                    ? "e.g. Friendly, knowledgeable 40-year-old female realtor — professional but approachable, explains things simply, never salesy."
                    : type === "animal"
                      ? "e.g. A golden retriever who acts as our upbeat brand mascot — playful, loyal, wears a tiny company bandana."
                      : "e.g. A friendly futuristic AI marketing assistant robot — rounded white body, warm glowing eyes, our brand colors."
                }
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-boss-violet/60"
              />
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => void compose()}
                  disabled={composing || !description.trim() || !aiConfigured}
                  title={aiConfigured ? undefined : "Needs ANTHROPIC_API_KEY"}
                  className="inline-flex items-center gap-2 rounded-xl bg-boss-violet px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
                >
                  {composing && <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden />}
                  {composing ? "Composing…" : "✨ Compose with AI"}
                </button>
                <button onClick={() => setStep("type")} className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:text-slate-900">
                  Back
                </button>
              </div>
            </>
          )}

          {step === "review" && draft && (
            <>
              <h3 className="text-sm font-semibold text-slate-900">Meet your character — review, tweak, save</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  Name
                  <input value={draftName} onChange={(e) => setDraftName(e.target.value)} className={`${fieldCls} normal-case`} />
                </label>
                <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  Role
                  <input value={draftRole} onChange={(e) => setDraftRole(e.target.value)} className={`${fieldCls} normal-case`} />
                </label>
                <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  Collection (optional)
                  <input value={draftCollection} onChange={(e) => setDraftCollection(e.target.value)} placeholder="e.g. My Real Estate Team" className={`${fieldCls} normal-case`} />
                </label>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                {(["appearance", "style", "personality", "voice"] as const).map((section) => (
                  <div key={section} className="rounded-xl bg-slate-50 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{section}</div>
                    <p className="mt-0.5 leading-relaxed">
                      {Object.values(draft.dna[section] ?? {}).filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Reference picture (optional)
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                  Every later render is built from this, so a picture you already have will look more
                  like {draftName.trim() || draft.name} than anything described in words. Skip it and
                  you can generate one for 1 credit instead.
                </p>
                <input
                  ref={draftRefInput}
                  type="file"
                  accept="image/*"
                  onChange={(e) => setDraftRef(e.target.files?.[0] ?? null)}
                  className="mt-2 block w-full text-[11px] text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-[11px] file:text-slate-700"
                />
                {/* Only a human can be a real person, so only a human is asked. */}
                {draftRef && type === "human" && (
                  <label className="mt-2 flex cursor-pointer items-start gap-2 text-[11px] leading-relaxed text-slate-700">
                    <input
                      type="checkbox"
                      checked={draftRealPerson}
                      onChange={(e) => setDraftRealPerson(e.target.checked)}
                      disabled={saving}
                      className="mt-0.5 accent-boss-violet"
                    />
                    <span>This is a photo of a real person (not AI-generated or illustrated).</span>
                  </label>
                )}
                {draftRef && type === "human" && draftRealPerson && (
                  <>
                    <textarea
                      value={draftConsent}
                      onChange={(e) => setDraftConsent(e.target.value)}
                      rows={2}
                      placeholder="Who is in this photo, and how did they agree to it being used in AI-generated ads?"
                      className="mt-2 w-full resize-y rounded-lg border border-slate-200 bg-white p-2 text-[11px] text-slate-900 placeholder:text-slate-400 outline-none focus:border-boss-violet/60"
                    />
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                      A human reference caps ads at 15s — the 30s model refuses face references.
                    </p>
                  </>
                )}
                {draftRef && (
                  <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                    Check the picture for logos you don&rsquo;t own: they get reproduced.
                  </p>
                )}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => void save()}
                  disabled={
                    saving ||
                    (!!draftRef && type === "human" && draftRealPerson && draftConsent.trim().length < 10)
                  }
                  className="inline-flex items-center gap-2 rounded-xl bg-boss-gold px-5 py-2.5 text-sm font-semibold text-black transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {saving ? "Saving…" : draftRef ? "Create with this reference" : "Create character"}
                </button>
                <button onClick={() => setStep("describe")} className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:text-slate-900">
                  Re-describe
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {/* Library */}
      {initial.length === 0 && !creating ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">
          No characters yet. Create your first — a presenter your audience will recognize in every post.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((c) => {
            const portrait = c.reference_images?.[0];
            const chips = dnaChips(c.dna);
            return (
              <div key={c.id} className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="grid aspect-square place-items-center bg-slate-100">
                  {portrait ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={portrait} alt={c.name} className="size-full object-cover" />
                  ) : (
                    <span className="text-6xl" aria-hidden>
                      {TYPE_META[c.type]?.emoji ?? "🎭"}
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1.5 p-4">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold text-slate-900">{c.name}</span>
                    <span className="text-[11px] text-slate-400">v{c.version}</span>
                    {c.usage_count > 0 && <span className="ml-auto text-[11px] text-slate-400">used {c.usage_count}×</span>}
                  </div>
                  <div className="text-xs text-slate-500">
                    {TYPE_META[c.type]?.emoji} {c.role || TYPE_META[c.type]?.label}
                    {c.collection ? ` · ${c.collection}` : ""}
                  </div>
                  {chips.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {chips.map((chip) => (
                        <span key={chip} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                          {chip}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
                    <Link
                      href={`/actions/new?intent=${encodeURIComponent(`Create a post presented by ${c.name}${c.role ? `, our ${c.role}` : ""}. ${c.prompt_profile ?? ""}`)}&type=image`}
                      className="rounded-lg bg-boss-gold px-3 py-1.5 text-xs font-semibold text-black transition hover:brightness-105"
                    >
                      Use character
                    </Link>
                    <button
                      onClick={() => void act(c.id, () => fetch(`/api/characters/${c.id}/portrait`, { method: "POST" }))}
                      disabled={busy === c.id}
                      title="Generate the canonical portrait — the identity reference (1 credit)"
                      className="rounded-lg border border-boss-violet/40 bg-boss-violet/10 px-3 py-1.5 text-xs font-medium text-slate-900 transition disabled:opacity-40"
                    >
                      {busy === c.id ? "Working…" : portrait ? "New portrait" : "Portrait · 1cr"}
                    </button>
                    <button
                      onClick={() => {
                        setPhotoFor(photoFor === c.id ? null : c.id);
                        setPhotoFile(null);
                        setConsent("");
                        setIsRealPerson(false);
                        setError(null);
                      }}
                      disabled={busy === c.id}
                      title="Use a real photo as the identity anchor instead of generating one"
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition hover:text-slate-900 disabled:opacity-40"
                    >
                      Use a photo
                    </button>
                    <button
                      onClick={() => void act(c.id, () => fetch(`/api/characters/${c.id}/duplicate`, { method: "POST" }))}
                      disabled={busy === c.id}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition hover:text-slate-900 disabled:opacity-40"
                    >
                      Duplicate
                    </button>
                    <button
                      onClick={() => void act(c.id, () => fetch(`/api/characters/${c.id}`, { method: "DELETE" }))}
                      disabled={busy === c.id}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-red-600/80 transition hover:text-red-600 disabled:opacity-40"
                    >
                      Archive
                    </button>
                  </div>

                  {photoFor === c.id && (
                    <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <p className="text-[11px] leading-relaxed text-amber-900">
                        This picture becomes {c.name}&rsquo;s identity anchor — every later render is
                        built from it, so use the clearest reference you have.
                      </p>
                      <input
                        ref={photoInput}
                        type="file"
                        accept="image/*"
                        onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
                        className="mt-2 block w-full text-[11px] text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-[11px] file:text-slate-700"
                      />
                      {/* Only a human character can be a real person — asking a
                          mascot's owner for consent teaches people to click past it. */}
                      {c.type === "human" && (
                        <label className="mt-2 flex cursor-pointer items-start gap-2 text-[11px] leading-relaxed text-amber-900">
                          <input
                            type="checkbox"
                            checked={isRealPerson}
                            onChange={(e) => setIsRealPerson(e.target.checked)}
                            disabled={busy === c.id}
                            className="mt-0.5 accent-amber-600"
                          />
                          <span>This is a photo of a real person (not AI-generated or illustrated).</span>
                        </label>
                      )}
                      {isRealPerson && c.type === "human" && (
                        <textarea
                          value={consent}
                          onChange={(e) => setConsent(e.target.value)}
                          rows={2}
                          placeholder="Who is in this photo, and how did they agree to it being used in AI-generated ads?"
                          className="mt-2 w-full resize-y rounded-lg border border-amber-200 bg-white p-2 text-[11px] text-slate-900 placeholder:text-slate-400 outline-none focus:border-amber-400"
                        />
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          onClick={() => void uploadPhoto(c.id)}
                          disabled={
                            busy === c.id ||
                            !photoFile ||
                            (isRealPerson && c.type === "human" && consent.trim().length < 10)
                          }
                          className="rounded-lg bg-boss-gold px-3 py-1.5 text-xs font-semibold text-black transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {busy === c.id ? "Saving…" : "Save photo"}
                        </button>
                        <button
                          onClick={() => setPhotoFor(null)}
                          disabled={busy === c.id}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition hover:text-slate-900 disabled:opacity-40"
                        >
                          Cancel
                        </button>
                      </div>
                      <p className="mt-2 text-[11px] leading-relaxed text-amber-800">
                        {c.type === "human"
                          ? "A human reference caps ads at 15s — the 30s model refuses face references. "
                          : ""}
                        Check the picture for logos you don&rsquo;t own: they get reproduced.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
