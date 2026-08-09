"use client";

type PubResult = { platform: string; ok: boolean; url?: string | null; error?: string };
type Metric = { likes?: number; comments?: number; views?: number };
export type PublishedPost = {
  id: string;
  status: string;
  type: "text" | "image" | "video";
  title: string | null;
  caption: string | null;
  media_url: string | null;
  channels: string[];
  results: PubResult[] | null;
  metrics: Record<string, Metric> | null;
  published_at: string | null;
  created_at: string;
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

function fmt(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function totalMetrics(metrics: Record<string, Metric> | null): { likes: number; comments: number; views: number } | null {
  if (!metrics || Object.keys(metrics).length === 0) return null;
  let likes = 0,
    comments = 0,
    views = 0;
  for (const m of Object.values(metrics)) {
    likes += m.likes ?? 0;
    comments += m.comments ?? 0;
    views += m.views ?? 0;
  }
  return { likes, comments, views };
}

/**
 * Published — the company's marketing timeline. Every completed action, with
 * its per-platform outcome and the engagement it earned.
 */
export default function PublishedHistory({ history }: { history: PublishedPost[] }) {
  if (history.length === 0) {
    return (
      <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">Nothing published yet.</p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {history.map((p) => (
        <div key={p.id} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          {p.media_url && p.type !== "video" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.media_url} alt="" className="size-14 shrink-0 rounded-lg object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span
                className={`rounded-full px-2 py-0.5 font-semibold capitalize ${
                  p.status === "published" ? "bg-emerald-500/15 text-emerald-600" : "bg-red-500/15 text-red-600"
                }`}
              >
                {p.status}
              </span>
              <span className="text-slate-400">{fmt(p.published_at || p.created_at)}</span>
              <span className="text-slate-500">{TYPE_EMOJI[p.type]}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-slate-700">{p.caption}</p>
            {(() => {
              const t = totalMetrics(p.metrics);
              return t ? (
                <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-slate-500">
                  <span>♥ {t.likes}</span>
                  <span>💬 {t.comments}</span>
                  {t.views > 0 && <span>▶ {t.views}</span>}
                </div>
              ) : null;
            })()}
            {p.results && (
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
                {p.results.map((r) => (
                  <span key={r.platform} className={r.ok ? "text-emerald-600" : "text-red-600"}>
                    {LABEL[r.platform] ?? r.platform}
                    {r.ok && r.url ? (
                      <>
                        {" "}
                        <a href={r.url} target="_blank" rel="noreferrer" className="underline">
                          ↗
                        </a>
                      </>
                    ) : r.ok ? (
                      " ✓"
                    ) : (
                      " ✕"
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
