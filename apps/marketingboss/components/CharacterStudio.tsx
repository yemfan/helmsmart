"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  const [busy, setBusy] = useState<string | null>(null);
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
      const b = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !b?.ok) throw new Error(b?.error || "Couldn't save the character.");
      resetWizard();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the character.");
    } finally {
      setSaving(false);
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
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => void save()}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-boss-gold px-5 py-2.5 text-sm font-semibold text-black transition hover:brightness-105 disabled:opacity-40"
                >
                  {saving ? "Saving…" : "Create character"}
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
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
