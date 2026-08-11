"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
type MilestoneDef = { id: string; title: string; metric: "published" | "engagement"; target: number };
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
  objective?: string | null;
  milestones?: MilestoneDef[] | null;
};
type PubResult = { platform: string; ok: boolean; url?: string | null; error?: string };
type CampaignPost = {
  id: string;
  status: "draft" | "approved" | "scheduled" | "publishing" | "published" | "failed" | "skipped";
  type: "text" | "image" | "video";
  angle: string | null;
  title: string | null;
  caption: string | null;
  hashtags: string[];
  link: string | null;
  media_prompt: string | null;
  media_url: string | null;
  channels: string[];
  results: PubResult[] | null;
  metrics: Record<string, { likes?: number; comments?: number; views?: number }> | null;
  reasoning?: string | null;
  estimated_credits?: number | null;
};

const LABEL: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  threads: "Threads",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
  youtube: "YouTube",
  tiktok: "TikTok",
};
const TYPE_EMOJI: Record<string, string> = { text: "✍️", image: "🖼️", video: "🎬" };

export default function CampaignDetail({ campaign, posts }: { campaign: Campaign; posts: CampaignPost[] }) {
  const router = useRouter();
  const [count, setCount] = useState(3);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const drafts = posts.filter((p) => p.status === "draft");
  const queued = posts.filter((p) => p.status === "approved" || p.status === "publishing");
  const done = posts.filter((p) => !["draft", "approved", "publishing"].includes(p.status));

  async function plan() {
    if (planning) return;
    setPlanning(true);
    setError(null);
    try {
      const res = await fetch(`/api/autopilot/campaigns/${campaign.id}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || `Planning failed (${res.status})`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Planning failed.");
    } finally {
      setPlanning(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/playbooks" className="text-xs text-slate-500 transition hover:text-slate-900">
          ← All playbooks
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h2 className="text-2xl font-bold tracking-tight">{campaign.name || "Playbook"}</h2>
          <span className="rounded-full bg-boss-violet/20 px-2 py-0.5 text-[10px] font-semibold capitalize text-boss-violet">
            {campaign.mode === "auto" ? "Full auto" : "Review"}
          </span>
        </div>
        {campaign.objective && <p className="mt-1 text-sm text-slate-600">🎯 {campaign.objective}</p>}
        <a href={campaign.link} target="_blank" rel="noreferrer" className="block truncate text-xs text-slate-500 hover:text-slate-700">
          {campaign.link}
        </a>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
          <span>{campaign.frequency}×/week</span>
          <span className="text-slate-400">·</span>
          <span>{campaign.media_types.join(", ")}</span>
          <span className="text-slate-400">·</span>
          <span>{campaign.channels.map((c) => LABEL[c] ?? c).join(", ")}</span>
          {campaign.budget_credits != null && (
            <>
              <span className="text-slate-400">·</span>
              <span>
                {campaign.spent_credits}/{campaign.budget_credits} credits
              </span>
            </>
          )}
        </div>
        {campaign.brief?.pillars && campaign.brief.pillars.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {campaign.brief.pillars.map((p, i) => (
              <span key={i} className="rounded-full border border-boss-gold/30 bg-boss-gold/10 px-2.5 py-1 text-[11px] text-boss-gold">
                {p}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Milestones — progress derived live from this playbook's posts. */}
      {campaign.milestones && campaign.milestones.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">Milestones</h3>
          <div className="mt-2 flex flex-col gap-2.5">
            {campaign.milestones.map((m) => {
              const current =
                m.metric === "published"
                  ? posts.filter((p) => p.status === "published").length
                  : posts.reduce((sum, p) => {
                      for (const v of Object.values(p.metrics ?? {}))
                        sum += (v.likes ?? 0) + (v.comments ?? 0) + (v.views ?? 0);
                      return sum;
                    }, 0);
              const pct = Math.min(100, Math.round((current / Math.max(m.target, 1)) * 100));
              const done = current >= m.target;
              return (
                <div key={m.id}>
                  <div className="flex items-center justify-between text-xs">
                    <span className={done ? "font-medium text-emerald-600" : "text-slate-600"}>
                      {done ? "✓ " : ""}
                      {m.title}
                    </span>
                    <span className="text-slate-400">
                      {Math.min(current, m.target)}/{m.target}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${done ? "bg-emerald-500" : "bg-boss-violet"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Plan */}
      <section className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div>
          <div className="text-sm font-semibold text-slate-900">Plan posts</div>
          <div className="text-xs text-slate-500">AI drafts a batch from your pillars — review, then publish.</div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={10}
            value={count}
            onChange={(e) => setCount(Math.min(Math.max(Number(e.target.value) || 1, 1), 10))}
            className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 outline-none focus:border-boss-violet/60"
          />
          <button
            onClick={plan}
            disabled={planning}
            className="inline-flex items-center gap-2 rounded-xl bg-boss-gold px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-105 disabled:opacity-40"
          >
            {planning && <Spinner />}
            {planning ? "Planning…" : "Plan posts"}
          </button>
        </div>
      </section>

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-sm text-red-600">{error}</div>}

      {/* Drafts */}
      {drafts.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-slate-900">Review queue ({drafts.length})</h3>
          {drafts.map((p) => (
            <PostCard key={p.id} post={p} onChanged={() => router.refresh()} />
          ))}
        </section>
      )}

      {/* Approved — waiting for the publisher to pick them up */}
      {queued.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-slate-900">Publishing soon ({queued.length})</h3>
          {queued.map((p) => (
            <QueuedCard key={p.id} post={p} onChanged={() => router.refresh()} />
          ))}
        </section>
      )}

      {/* Done */}
      {done.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-slate-900">Published &amp; history</h3>
          {done.map((p) => (
            <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-1 flex items-center gap-2 text-xs">
                <span>{TYPE_EMOJI[p.type]}</span>
                <span className="font-medium text-slate-700">{p.angle}</span>
                <span
                  className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${
                    p.status === "published" ? "bg-emerald-500/15 text-emerald-600" : "bg-red-500/15 text-red-600"
                  }`}
                >
                  {p.status}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-slate-700">{p.caption}</p>
              {p.metrics &&
                Object.keys(p.metrics).length > 0 &&
                (() => {
                  let likes = 0,
                    comments = 0,
                    views = 0;
                  for (const m of Object.values(p.metrics)) {
                    likes += m.likes ?? 0;
                    comments += m.comments ?? 0;
                    views += m.views ?? 0;
                  }
                  return (
                    <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-slate-500">
                      <span>♥ {likes}</span>
                      <span>💬 {comments}</span>
                      {views > 0 && <span>▶ {views}</span>}
                    </div>
                  );
                })()}
              {p.results && (
                <ul className="mt-2 space-y-1 text-xs">
                  {p.results.map((r) => (
                    <li key={r.platform} className={r.ok ? "text-emerald-600" : "text-red-600"}>
                      <span className="font-medium">{LABEL[r.platform] ?? r.platform}</span>:{" "}
                      {r.ok ? (
                        r.url ? (
                          <a href={r.url} target="_blank" rel="noreferrer" className="underline hover:brightness-110">
                            published ↗
                          </a>
                        ) : (
                          "published ✓"
                        )
                      ) : (
                        r.error
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      )}

      {posts.length === 0 && (
        <p className="rounded-2xl border border-slate-200 bg-white p-5 text-center text-sm text-slate-500">
          No posts yet — click <span className="text-slate-900">Plan posts</span> to have AI draft your first batch.
        </p>
      )}
    </div>
  );
}

function PostCard({ post, onChanged }: { post: CampaignPost; onChanged: () => void }) {
  const [title, setTitle] = useState(post.title ?? "");
  const [caption, setCaption] = useState(post.caption ?? "");
  const [hashtags, setHashtags] = useState((post.hashtags ?? []).map((h) => `#${h.replace(/^#/, "")}`).join(" "));
  const [mediaPrompt, setMediaPrompt] = useState(post.media_prompt ?? "");
  const [mediaUrl, setMediaUrl] = useState(post.media_url);
  const [busy, setBusy] = useState<null | "save" | "gen" | "pub" | "approve" | "del">(null);
  const [err, setErr] = useState<string | null>(null);

  const needsMedia = post.type !== "text";
  const fieldCls =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-boss-violet/60";

  async function save(): Promise<boolean> {
    const res = await fetch(`/api/autopilot/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        caption,
        mediaPrompt,
        hashtags: hashtags.split(/[\s,]+/).map((h) => h.replace(/^#/, "")).filter(Boolean),
      }),
    });
    return res.ok;
  }

  async function onSave() {
    if (busy) return;
    setBusy("save");
    setErr(null);
    try {
      if (!(await save())) throw new Error("Save failed.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(null);
    }
  }

  async function generate() {
    if (busy) return;
    setBusy("gen");
    setErr(null);
    try {
      await save();
      const res = await fetch(`/api/autopilot/posts/${post.id}/generate`, { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok) throw new Error(data.error || `Generation failed (${res.status})`);
      setMediaUrl(data.url ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setBusy(null);
    }
  }

  // Instant: mark approved and move on — the system generates anything
  // missing and publishes it in the background (next cron tick, ≤15 min).
  async function approve() {
    if (busy) return;
    setBusy("approve");
    setErr(null);
    try {
      const res = await fetch(`/api/autopilot/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          caption,
          mediaPrompt,
          hashtags: hashtags.split(/[\s,]+/).map((h) => h.replace(/^#/, "")).filter(Boolean),
          status: "approved",
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || `Approve failed (${res.status})`);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Approve failed.");
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    if (busy) return;
    setBusy("pub");
    setErr(null);
    try {
      await save();
      const res = await fetch(`/api/autopilot/posts/${post.id}/publish`, { method: "POST" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || `Publish failed (${res.status})`);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Publish failed.");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy("del");
    try {
      await fetch(`/api/autopilot/posts/${post.id}`, { method: "DELETE" });
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
          {TYPE_EMOJI[post.type]} {post.type}
        </span>
        {post.angle && <span className="text-slate-500">{post.angle}</span>}
        {typeof post.estimated_credits === "number" && post.estimated_credits > 0 && (
          <span
            title="Credits this action will spend when approved"
            className="rounded-full border border-boss-gold/30 bg-boss-gold/10 px-2 py-0.5 font-semibold text-boss-gold"
          >
            ~{post.estimated_credits} credits
          </span>
        )}
        <span className="ml-auto text-slate-400">{post.channels.map((c) => LABEL[c] ?? c).join(", ")}</span>
      </div>

      {post.reasoning && (
        <p className="mb-2 rounded-lg bg-boss-violet/5 px-3 py-2 text-xs leading-relaxed text-slate-600">
          <span className="font-semibold text-boss-violet">Why:</span> {post.reasoning}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className={fieldCls} />
        <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={4} className={`${fieldCls} resize-y leading-relaxed`} />
        <input value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#hashtags" className={fieldCls} />
        {needsMedia && (
          <input value={mediaPrompt} onChange={(e) => setMediaPrompt(e.target.value)} placeholder={`${post.type} prompt`} className={fieldCls} />
        )}
      </div>

      {mediaUrl && (
        <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
          {post.type === "video" ? (
            <video src={mediaUrl} controls className="max-h-64 w-full" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl} alt="" className="max-h-64 w-full object-contain" />
          )}
        </div>
      )}

      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={onSave} disabled={!!busy} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition hover:text-slate-900 disabled:opacity-40">
          {busy === "save" ? "Saving…" : "Save"}
        </button>
        {needsMedia && (
          <button onClick={generate} disabled={!!busy} className="rounded-lg border border-boss-violet/40 bg-boss-violet/10 px-3 py-1.5 text-xs font-medium text-slate-900 transition hover:text-slate-900 disabled:opacity-40">
            {busy === "gen" ? "Generating…" : mediaUrl ? "Regenerate" : "Generate preview"}
          </button>
        )}
        <button
          onClick={remove}
          disabled={!!busy}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-red-600/80 transition hover:text-red-600 disabled:opacity-40"
        >
          Delete
        </button>
        <button
          onClick={publish}
          disabled={!!busy}
          title="Publish right now and wait for it (may take a minute for media posts)"
          className="ml-auto inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition hover:text-slate-900 disabled:opacity-40"
        >
          {busy === "pub" && <Spinner />}
          {busy === "pub" ? "Publishing…" : "Publish now"}
        </button>
        <button
          onClick={approve}
          disabled={!!busy}
          title="Approve instantly — the system generates anything missing and publishes it shortly"
          className="inline-flex items-center gap-2 rounded-xl bg-boss-gold px-4 py-2 text-sm font-semibold text-black transition hover:brightness-105 disabled:opacity-40"
        >
          {busy === "approve" && <Spinner />}
          {busy === "approve" ? "Approving…" : "✓ Approve"}
        </button>
      </div>
    </div>
  );
}

/** An approved post waiting for the background publisher (next cron tick). */
function QueuedCard({ post, onChanged }: { post: CampaignPost; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const publishing = post.status === "publishing";

  async function backToDrafts() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`/api/autopilot/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "draft" }),
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.04] p-4">
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 font-semibold text-emerald-600">
          {publishing && <span className="size-3 animate-spin rounded-full border-2 border-emerald-600/30 border-t-emerald-600" aria-hidden />}
          {publishing ? "Publishing…" : "✓ Approved — publishing soon"}
        </span>
        <span className="text-slate-500">
          {TYPE_EMOJI[post.type]}
          {post.angle ? ` ${post.angle}` : ""}
        </span>
        <span className="ml-auto text-slate-400">{post.channels.map((c) => LABEL[c] ?? c).join(", ")}</span>
      </div>
      <p className="line-clamp-3 whitespace-pre-wrap text-sm text-slate-700">{post.caption}</p>
      {post.media_url && post.type !== "video" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.media_url} alt="" className="mt-2 max-h-40 rounded-lg object-contain" />
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-400">
          {publishing ? "The system is publishing this post." : "The system will generate anything missing and publish it within ~15 minutes."}
        </span>
        {!publishing && (
          <button
            onClick={backToDrafts}
            disabled={busy}
            className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500 transition hover:text-slate-900 disabled:opacity-40"
          >
            Back to drafts
          </button>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return <span className="size-4 animate-spin rounded-full border-2 border-black/30 border-t-black" aria-hidden />;
}
