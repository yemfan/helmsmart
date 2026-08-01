"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type ChannelOption = { id: string; label: string; connected: boolean };

type Competitor = { name: string; angle: string };
type BrandBrief = {
  name: string;
  summary: string;
  audience: string;
  tone: string;
  sellingPoints: string[];
  competitors: Competitor[];
  pillars: string[];
  suggestedHashtags: string[];
};
type Campaign = {
  id: string;
  link: string;
  name: string | null;
  brief: BrandBrief | null;
  media_types: string[];
  channels: string[];
  frequency: number;
  budget_credits: number | null;
  spent_credits: number;
  mode: "review" | "auto";
  status: "active" | "paused";
  next_run_at: string | null;
  created_at: string;
};

const MEDIA_TYPES: { id: string; label: string; emoji: string }[] = [
  { id: "text", label: "Text", emoji: "✍️" },
  { id: "image", label: "Image", emoji: "🖼️" },
  { id: "video", label: "Video", emoji: "🎬" },
];

export default function Autopilot({
  campaigns,
  channels,
  aiConfigured,
}: {
  campaigns: Campaign[];
  channels: ChannelOption[];
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const connectedChannels = channels.filter((c) => c.connected);

  const [link, setLink] = useState("");
  const [researching, setResearching] = useState(false);
  const [brief, setBrief] = useState<BrandBrief | null>(null);
  const [name, setName] = useState("");

  const [mediaTypes, setMediaTypes] = useState<Set<string>>(new Set(["image"]));
  const [selChannels, setSelChannels] = useState<Set<string>>(new Set());
  const [frequency, setFrequency] = useState(3);
  const [budget, setBudget] = useState("");
  const [mode, setMode] = useState<"review" | "auto">("review");

  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(set: Set<string>, setter: (s: Set<string>) => void, v: string) {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    setter(next);
  }

  async function research() {
    const l = link.trim();
    if (!l || researching) return;
    setResearching(true);
    setError(null);
    setBrief(null);
    try {
      const res = await fetch("/api/autopilot/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ link: l }),
      });
      const data = (await res.json()) as { brief?: BrandBrief; error?: string };
      if (!res.ok || !data.brief) throw new Error(data.error || `Research failed (${res.status})`);
      setBrief(data.brief);
      setName(data.brief.name || "");
      setSelChannels(new Set(connectedChannels.map((c) => c.id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Research failed.");
    } finally {
      setResearching(false);
    }
  }

  async function create() {
    if (!brief || saving) return;
    if (mediaTypes.size === 0) return setError("Pick at least one content type.");
    if (selChannels.size === 0) return setError("Pick at least one channel.");
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/autopilot/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          link: link.trim(),
          brief,
          name: name.trim() || brief.name,
          mediaTypes: [...mediaTypes],
          channels: [...selChannels],
          frequency,
          budgetCredits: budget.trim() === "" ? null : Number(budget),
          mode,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || `Save failed (${res.status})`);
      // Reset the form and refresh the list.
      setLink("");
      setBrief(null);
      setName("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the campaign.");
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(id: string, status: "active" | "paused") {
    if (busyId) return;
    setBusyId(id);
    try {
      await fetch(`/api/autopilot/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    if (busyId) return;
    if (!confirm("Delete this campaign? Its drafts and history will be removed.")) return;
    setBusyId(id);
    try {
      await fetch(`/api/autopilot/campaigns/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  const fieldCls =
    "w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/35 outline-none focus:border-boss-violet/60";
  const primaryBtn =
    "inline-flex items-center gap-2 rounded-xl bg-boss-gold px-5 py-2.5 text-sm font-semibold text-black transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40";

  if (!aiConfigured) {
    return (
      <div className="rounded-2xl border border-white/10 bg-ink-2/70 p-5 text-sm text-white/60">
        AI isn&apos;t turned on yet. Set <code className="text-boss-gold">ANTHROPIC_API_KEY</code> in the project to
        enable autopilot research.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* New campaign */}
      <section className="rounded-2xl border border-white/10 bg-ink-2/70 p-4 sm:p-5">
        <h3 className="mb-3 text-base font-semibold text-white">New campaign</h3>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && research()}
            placeholder="https://your-product-or-business.com"
            className={fieldCls}
          />
          <button onClick={research} disabled={researching || !link.trim()} className={`${primaryBtn} shrink-0`}>
            {researching && <Spinner />}
            {researching ? "Researching…" : brief ? "Re-research" : "Research"}
          </button>
        </div>
        {researching && (
          <p className="mt-2 text-xs text-white/45">
            Reading your page, scanning your market and competitors — this can take up to a minute.
          </p>
        )}

        {brief && (
          <div className="mt-4 flex flex-col gap-4">
            {/* Brief */}
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-boss-gold">Your brand brief</div>
              <p className="text-sm text-white/80">{brief.summary}</p>
              <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                <Info label="Audience" value={brief.audience} />
                <Info label="Voice" value={brief.tone} />
              </dl>
              {brief.sellingPoints.length > 0 && (
                <ChipRow label="Selling points" items={brief.sellingPoints} />
              )}
              {brief.pillars.length > 0 && <ChipRow label="Content pillars" items={brief.pillars} gold />}
              {brief.competitors.length > 0 && (
                <div className="mt-3">
                  <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-white/40">Competitors</div>
                  <ul className="space-y-1 text-xs text-white/60">
                    {brief.competitors.map((c, i) => (
                      <li key={i}>
                        <span className="font-medium text-white/80">{c.name}</span> — {c.angle}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Settings */}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-white/40">Campaign name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} className={fieldCls} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-white/40">Posts per week</span>
                <input
                  type="number"
                  min={1}
                  max={21}
                  value={frequency}
                  onChange={(e) => setFrequency(Math.min(Math.max(Number(e.target.value) || 1, 1), 21))}
                  className={fieldCls}
                />
              </label>
            </div>

            <div>
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-white/40">Content types (controls cost)</div>
              <div className="flex flex-wrap gap-1.5">
                {MEDIA_TYPES.map((m) => {
                  const on = mediaTypes.has(m.id);
                  return (
                    <button
                      key={m.id}
                      onClick={() => toggle(mediaTypes, setMediaTypes, m.id)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        on ? "border-boss-gold/50 bg-boss-gold/15 text-boss-gold" : "border-white/15 bg-white/[0.04] text-white/60 hover:text-white"
                      }`}
                    >
                      {on ? "✓ " : ""}
                      {m.emoji} {m.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-[11px] text-white/35">Image ≈ 1 credit · video ≈ 20. Limit types to cap spend.</p>
            </div>

            <div>
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-white/40">Channels</div>
              {connectedChannels.length === 0 ? (
                <p className="text-xs text-white/55">
                  No channels connected.{" "}
                  <Link href="/connections" className="text-boss-gold underline underline-offset-2">
                    Connect accounts →
                  </Link>
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {channels.map((c) => {
                    if (!c.connected) {
                      return (
                        <a
                          key={c.id}
                          href="/connections"
                          className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs text-white/40 transition hover:text-white/70"
                        >
                          + {c.label}
                        </a>
                      );
                    }
                    const on = selChannels.has(c.id);
                    return (
                      <button
                        key={c.id}
                        onClick={() => toggle(selChannels, setSelChannels, c.id)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                          on ? "border-boss-gold/50 bg-boss-gold/15 text-boss-gold" : "border-white/15 bg-white/[0.04] text-white/60 hover:text-white"
                        }`}
                      >
                        {on ? "✓ " : ""}
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-white/40">Credit budget (optional)</span>
                <input
                  type="number"
                  min={0}
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="Uncapped"
                  className={fieldCls}
                />
              </label>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-white/40">Autonomy</span>
                <div className="inline-flex rounded-lg border border-white/10 bg-black/30 p-1 text-sm">
                  {(["review", "auto"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium capitalize transition ${
                        mode === m ? "bg-boss-violet text-white shadow" : "text-white/60 hover:text-white"
                      }`}
                    >
                      {m === "review" ? "Review first" : "Full auto"}
                    </button>
                  ))}
                </div>
                <span className="text-[11px] text-white/35">
                  {mode === "review" ? "AI drafts; you approve before it posts." : "AI posts on schedule automatically."}
                </span>
              </div>
            </div>

            <div className="flex justify-end">
              <button onClick={create} disabled={saving} className={primaryBtn}>
                {saving && <Spinner />}
                {saving ? "Saving…" : "Create campaign"}
              </button>
            </div>
          </div>
        )}
      </section>

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-sm text-red-200">{error}</div>}

      {/* Existing campaigns */}
      {campaigns.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="rounded-xl border border-boss-violet/25 bg-boss-violet/10 p-3 text-xs text-white/70">
            Your strategy is saved. Automatic planning &amp; posting are rolling out next — for now you can create and
            manage campaigns here.
          </div>
          {campaigns.map((c) => (
            <div key={c.id} className="rounded-2xl border border-white/10 bg-ink-2/70 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/autopilot/${c.id}`} className="font-semibold text-white hover:text-boss-gold">
                      {c.name || "Campaign"}
                    </Link>
                    <Badge tone={c.status === "active" ? "green" : "muted"}>{c.status}</Badge>
                    <Badge tone="violet">{c.mode === "auto" ? "Full auto" : "Review"}</Badge>
                  </div>
                  <a href={c.link} target="_blank" rel="noreferrer" className="mt-0.5 block truncate text-xs text-white/45 hover:text-white/70">
                    {c.link}
                  </a>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => setStatus(c.id, c.status === "active" ? "paused" : "active")}
                    disabled={busyId === c.id}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 transition hover:text-white disabled:opacity-40"
                  >
                    {c.status === "active" ? "Pause" : "Resume"}
                  </button>
                  <button
                    onClick={() => remove(c.id)}
                    disabled={busyId === c.id}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-red-300/80 transition hover:text-red-300 disabled:opacity-40"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-white/50">
                <span>{c.frequency}×/week</span>
                <span className="text-white/20">·</span>
                <span>{c.media_types.join(", ")}</span>
                <span className="text-white/20">·</span>
                <span>{c.channels.map((ch) => LABEL[ch] ?? ch).join(", ")}</span>
                {c.budget_credits != null && (
                  <>
                    <span className="text-white/20">·</span>
                    <span>
                      {c.spent_credits}/{c.budget_credits} credits
                    </span>
                  </>
                )}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

const LABEL: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  threads: "Threads",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
  youtube: "YouTube",
  tiktok: "TikTok",
};

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-white/40">{label}</dt>
      <dd className="text-white/70">{value}</dd>
    </div>
  );
}

function ChipRow({ label, items, gold = false }: { label: string; items: string[]; gold?: boolean }) {
  return (
    <div className="mt-3">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-white/40">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it, i) => (
          <span
            key={i}
            className={`rounded-full border px-2.5 py-1 text-[11px] ${
              gold ? "border-boss-gold/30 bg-boss-gold/10 text-boss-gold" : "border-white/10 bg-white/[0.04] text-white/60"
            }`}
          >
            {it}
          </span>
        ))}
      </div>
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "green" | "violet" | "muted" }) {
  const cls =
    tone === "green"
      ? "bg-emerald-500/15 text-emerald-300"
      : tone === "violet"
        ? "bg-boss-violet/20 text-boss-violet"
        : "bg-white/10 text-white/50";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${cls}`}>{children}</span>;
}

function Spinner() {
  return <span className="size-4 animate-spin rounded-full border-2 border-black/30 border-t-black" aria-hidden />;
}
