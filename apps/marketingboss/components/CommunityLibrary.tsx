"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CommunityScoreComponents, CommunityWithSave } from "@/lib/communityIntelligence";

/**
 * 🌐 Community Library — recommendation-first, never a directory dump.
 * Cards show the culture, the rules, an opportunity score with its WHY, and
 * a one-click "Write a post for this community" composer handoff.
 */

const PLATFORM_META: Record<string, { emoji: string; label: string }> = {
  reddit: { emoji: "🟠", label: "Reddit" },
  facebook: { emoji: "🔵", label: "Facebook" },
  linkedin: { emoji: "🔷", label: "LinkedIn" },
  discord: { emoji: "🟣", label: "Discord" },
  slack: { emoji: "🟩", label: "Slack" },
  x: { emoji: "⬛", label: "X" },
  youtube: { emoji: "🔴", label: "YouTube" },
  quora: { emoji: "🟥", label: "Quora" },
  forum: { emoji: "💬", label: "Forum" },
};

const COMPONENT_LABEL: Record<keyof CommunityScoreComponents, string> = {
  audienceMatch: "Audience match",
  engagement: "Engagement",
  growth: "Growth",
  competition: "Low saturation",
  promotionTolerance: "Promo tolerance",
  conversionPotential: "Conversion",
};

function writeIntent(c: CommunityWithSave): string {
  const culture = [c.culture?.tone, c.culture?.formality, c.culture?.technicalDepth].filter(Boolean).join(", ");
  const best = c.dna?.bestContent?.slice(0, 3).join(" / ");
  return [
    `Write a post for the ${c.platform} community "${c.name}"${c.industry ? ` (${c.industry})` : ""}.`,
    culture ? `Match its culture: ${culture}.` : "",
    c.rules?.selfPromotionPolicy ? `Respect its rules: ${c.rules.selfPromotionPolicy}.` : "",
    best ? `Formats that work there: ${best}.` : "",
    c.dna?.recommendation ? `House advice: ${c.dna.recommendation}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export default function CommunityLibrary({
  initial,
  businessName,
  hasBusiness,
  aiConfigured,
}: {
  initial: CommunityWithSave[];
  businessName: string | null;
  hasBusiness: boolean;
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [q, setQ] = useState("");
  const [platform, setPlatform] = useState("");
  const [savedOnly, setSavedOnly] = useState(false);
  const [searching, setSearching] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [openScore, setOpenScore] = useState<string | null>(null);
  const [openProfile, setOpenProfile] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function search(overrides?: { saved?: boolean }) {
    if (searching) return;
    setSearching(true);
    setNote(null);
    try {
      const p = new URLSearchParams();
      if (q.trim()) p.set("q", q.trim());
      if (platform) p.set("platform", platform);
      if (overrides?.saved ?? savedOnly) p.set("saved", "1");
      const res = await fetch(`/api/communities?${p.toString()}`);
      const b = (await res.json().catch(() => null)) as { ok?: boolean; communities?: CommunityWithSave[]; error?: string } | null;
      if (!res.ok || !b?.communities) throw new Error(b?.error || "Search failed — please try again.");
      setItems(b.communities);
      if (b.communities.length === 0) setNote("No matches — clear the filters or run discovery.");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Search failed — please try again.");
    } finally {
      setSearching(false);
    }
  }

  async function discover() {
    if (discovering) return;
    setDiscovering(true);
    setNote(null);
    try {
      const res = await fetch("/api/communities/discover", { method: "POST" });
      const b = (await res.json().catch(() => null)) as { ok?: boolean; found?: number; error?: string } | null;
      if (!res.ok || !b?.ok) throw new Error(b?.error || "The research ran long and was cut off — runs vary, try once more.");
      setNote(
        b.found && b.found > 0
          ? `Found ${b.found} new communit${b.found === 1 ? "y" : "ies"} for your audience.`
          : "Scan complete — no new communities this round.",
      );
      router.refresh();
      await search();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Discovery failed — please try again.");
    } finally {
      setDiscovering(false);
    }
  }

  async function toggleSave(c: CommunityWithSave) {
    if (busy) return;
    setBusy(c.id);
    try {
      await fetch(`/api/communities/${c.id}/save`, { method: c.saved ? "DELETE" : "POST" });
      setItems((cur) => cur.map((x) => (x.id === c.id ? { ...x, saved: !c.saved, collection: c.saved ? null : "Favorites" } : x)));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Recommendation-first header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {hasBusiness
            ? `Communities matched to ${businessName ?? "your business"} — best opportunity first.`
            : "Paste your company URL in the Brand Kit first — discovery searches for YOUR audience's communities."}
        </p>
        <button
          onClick={() => void discover()}
          disabled={discovering || !hasBusiness || !aiConfigured}
          title={!aiConfigured ? "Needs ANTHROPIC_API_KEY" : !hasBusiness ? "Fill in your business profile first" : "Research where your audience gathers"}
          className="inline-flex items-center gap-2 rounded-xl bg-boss-violet px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
        >
          {discovering && <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden />}
          {discovering ? "Researching…" : "Find my communities"}
        </button>
      </div>

      {discovering && (
        <p className="rounded-xl border border-boss-violet/20 bg-boss-violet/5 p-3 text-xs text-slate-600">
          Searching where your audience actually gathers — checking sizes, rules, and culture. This can take a minute
          or two.
        </p>
      )}
      {note && <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">{note}</p>}

      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void search()}
          placeholder="Search communities…"
          className="w-52 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-boss-violet/60"
        />
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-boss-violet/60"
        >
          <option value="">All platforms</option>
          {Object.entries(PLATFORM_META).map(([k, m]) => (
            <option key={k} value={k}>
              {m.label}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            setSavedOnly((s) => {
              void search({ saved: !s });
              return !s;
            });
          }}
          className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
            savedOnly ? "border-boss-gold/50 bg-boss-gold/10 text-boss-gold" : "border-slate-200 text-slate-600 hover:text-slate-900"
          }`}
        >
          ★ Saved
        </button>
        <button
          onClick={() => void search()}
          disabled={searching}
          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 transition hover:text-slate-900 disabled:opacity-40"
        >
          {searching ? "…" : "Search"}
        </button>
      </div>

      {items.length === 0 && !discovering ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">
          No communities yet — hit <span className="font-medium text-slate-700">Find my communities</span> and the AI
          researches where your audience gathers.
        </div>
      ) : (
        items.map((c) => {
          const pm = PLATFORM_META[c.platform] ?? { emoji: "🌐", label: c.platform };
          const cultureChips = [c.culture?.tone, c.culture?.friendliness, c.culture?.technicalDepth].filter(Boolean).slice(0, 3);
          return (
            <div key={c.id} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                  {pm.emoji} {pm.label}
                </span>
                <button
                  onClick={() => setOpenScore((cur) => (cur === c.id ? null : c.id))}
                  className="rounded-full border border-boss-gold/30 bg-boss-gold/10 px-2 py-0.5 font-semibold text-boss-gold"
                  title="See why this score"
                >
                  Opportunity {Math.round(Number(c.opportunity_score))} ▾
                </button>
                {c.rules?.promotionAllowed && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">Promotion: {c.rules.promotionAllowed}</span>
                )}
                {c.audience?.membersEstimate && <span className="text-slate-400">{c.audience.membersEstimate}</span>}
                <button
                  onClick={() => void toggleSave(c)}
                  disabled={busy === c.id}
                  className={`ml-auto rounded-full border px-2.5 py-0.5 font-medium transition disabled:opacity-40 ${
                    c.saved ? "border-boss-gold/50 bg-boss-gold/10 text-boss-gold" : "border-slate-200 text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {c.saved ? "★ Saved" : "☆ Save"}
                </button>
              </div>

              {openScore === c.id && c.score_components && (
                <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-0.5 rounded-lg bg-slate-50 p-2.5 text-[11px] text-slate-600 sm:grid-cols-3">
                  {(Object.keys(COMPONENT_LABEL) as (keyof CommunityScoreComponents)[]).map((k) =>
                    typeof c.score_components?.[k] === "number" ? (
                      <div key={k} className="flex justify-between gap-2">
                        <span>{COMPONENT_LABEL[k]}</span>
                        <span className="font-semibold text-slate-900">{Math.round(c.score_components[k]!)}</span>
                      </div>
                    ) : null,
                  )}
                </div>
              )}

              <h4 className="mt-2 text-base font-semibold text-slate-900">
                {c.url ? (
                  <a href={c.url} target="_blank" rel="noreferrer" className="hover:text-boss-gold">
                    {c.name} ↗
                  </a>
                ) : (
                  c.name
                )}
              </h4>
              {c.description && <p className="mt-1 text-sm text-slate-600">{c.description}</p>}
              {cultureChips.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {cultureChips.map((chip) => (
                    <span key={chip} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                      {chip}
                    </span>
                  ))}
                </div>
              )}
              {c.dna?.recommendation && (
                <p className="mt-2 rounded-lg bg-boss-violet/5 px-3 py-2 text-xs leading-relaxed text-slate-600">
                  <span className="font-semibold text-boss-violet">How to win here:</span> {c.dna.recommendation}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link
                  href={`/actions/new?intent=${encodeURIComponent(writeIntent(c))}&type=text`}
                  className="rounded-xl bg-boss-gold px-4 py-2 text-sm font-semibold text-black transition hover:brightness-105"
                >
                  Write a post for this community
                </Link>
                <button
                  onClick={() => setOpenProfile((cur) => (cur === c.id ? null : c.id))}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 transition hover:text-slate-900"
                >
                  {openProfile === c.id ? "Hide profile" : "Profile"}
                </button>
              </div>

              {openProfile === c.id && (
                <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                  {(c.topics?.trending?.length ?? 0) > 0 && (
                    <div className="rounded-xl bg-slate-50 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Trending topics</div>
                      <p className="mt-0.5">{c.topics!.trending!.slice(0, 6).join(" · ")}</p>
                    </div>
                  )}
                  {(c.dna?.bestContent?.length ?? 0) > 0 && (
                    <div className="rounded-xl bg-slate-50 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Best content</div>
                      <p className="mt-0.5">{c.dna!.bestContent!.join(" · ")}</p>
                    </div>
                  )}
                  {c.rules?.note && (
                    <div className="rounded-xl bg-slate-50 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Rules</div>
                      <p className="mt-0.5">{c.rules.note}</p>
                    </div>
                  )}
                  {(c.dna?.bestTime || c.dna?.postingStyle) && (
                    <div className="rounded-xl bg-slate-50 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Posting</div>
                      <p className="mt-0.5">
                        {[c.dna?.postingStyle, c.dna?.bestTime].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
