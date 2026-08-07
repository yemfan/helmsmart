import Link from "next/link";
import type { PerfSummary } from "@/lib/performance";

/**
 * Performance dashboard — what's working across everything you've published.
 * Presentational: the server page builds the summary and passes it in.
 */

const PLATFORM_LABEL: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  threads: "Threads",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
  youtube: "YouTube",
  tiktok: "TikTok",
};
const TYPE_LABEL: Record<string, string> = { image: "Images", video: "Video", text: "Text" };

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export default function Performance({ summary }: { summary: PerfSummary }) {
  if (summary.totalPosts === 0) {
    return (
      <div className="rounded-2xl border border-line bg-white p-8 text-center">
        <p className="text-2xl">📊</p>
        <p className="mt-2 text-sm font-medium text-ink">No performance data yet</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-ink-3">
          Publish a few posts and connect your accounts — once we can read engagement, this is where you&apos;ll see
          what&apos;s working, and one click to make more like it.
        </p>
        <Link
          href="/compose/new"
          className="mt-4 inline-block rounded-xl bg-boss-gold px-5 py-2.5 text-sm font-semibold text-black transition hover:brightness-105"
        >
          Create a post
        </Link>
      </div>
    );
  }

  const maxPlatform = Math.max(1, ...summary.byPlatform.map((p) => p.score));
  const bestType = summary.byType[0];

  return (
    <div className="flex flex-col gap-6">
      {/* Headline stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Posts published" value={String(summary.totalPosts)} />
        <Tile label="Total engagement" value={fmt(summary.totalEngagement)} accent />
        <Tile label="Likes" value={fmt(summary.totalLikes)} />
        <Tile label="Views" value={fmt(summary.totalViews)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* By platform */}
        <div className="rounded-2xl border border-line bg-white p-5">
          <h3 className="text-sm font-semibold text-ink">Engagement by platform</h3>
          <ul className="mt-3 flex flex-col gap-2.5">
            {summary.byPlatform.map((p) => (
              <li key={p.platform} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-xs font-medium text-ink-3">
                  {PLATFORM_LABEL[p.platform] ?? p.platform}
                </span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <span
                    className="block h-full rounded-full bg-boss-violet"
                    style={{ width: `${Math.round((p.score / maxPlatform) * 100)}%` }}
                  />
                </span>
                <span className="w-12 shrink-0 text-right text-xs font-semibold text-ink">{fmt(p.score)}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* What works: format + angles */}
        <div className="rounded-2xl border border-line bg-white p-5">
          <h3 className="text-sm font-semibold text-ink">What&apos;s working</h3>
          {bestType && (
            <p className="mt-2 text-xs text-ink-3">
              Your best format is{" "}
              <span className="font-semibold text-boss-violet">{TYPE_LABEL[bestType.key] ?? bestType.key}</span> —{" "}
              {fmt(bestType.score)} engagement across {bestType.count} post{bestType.count === 1 ? "" : "s"}.
            </p>
          )}
          {summary.topAngles.length > 0 && (
            <>
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Top themes</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {summary.topAngles.map((a) => (
                  <span
                    key={a.key}
                    className="rounded-full border border-line bg-slate-50 px-2.5 py-1 text-xs text-ink-3"
                    title={`${fmt(a.score)} engagement · ${a.count} post${a.count === 1 ? "" : "s"}`}
                  >
                    {a.key} <span className="text-slate-400">· {fmt(a.score)}</span>
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Top posts */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-ink">Top posts</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {summary.topPosts.map((post) => (
            <div key={post.id} className="flex flex-col overflow-hidden rounded-2xl border border-line bg-white">
              {post.mediaUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.mediaUrl} alt="" className="aspect-video w-full object-cover" />
              ) : (
                <div className="grid aspect-video w-full place-items-center bg-slate-50 text-2xl">📝</div>
              )}
              <div className="flex flex-1 flex-col gap-1 p-3">
                <p className="line-clamp-2 text-sm font-medium text-ink">{post.title || "Untitled post"}</p>
                <p className="text-[11px] text-ink-3">
                  {TYPE_LABEL[post.type] ?? post.type}
                  {post.angle ? ` · ${post.angle}` : ""} · {fmt(post.score)} engagement
                </p>
                <Link
                  href={`/compose/new${post.angle ? `?angle=${encodeURIComponent(post.angle)}` : ""}`}
                  className="mt-auto pt-2 text-xs font-semibold text-boss-violet hover:underline"
                >
                  Make more like this →
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <p className="text-xs text-ink-3">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent ? "text-boss-violet" : "text-ink"}`}>{value}</p>
    </div>
  );
}
