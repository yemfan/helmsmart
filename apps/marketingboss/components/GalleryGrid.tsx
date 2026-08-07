"use client";

import { useMemo, useState } from "react";

type Generation = {
  id: string;
  type: "image" | "video";
  prompt: string;
  aspect: string | null;
  media_url: string;
  created_at: string;
};

type Filter = "all" | "image" | "video";

/**
 * Gallery grid with a type filter (All / Images / Video) and prompt search.
 * Filtering is client-side — the page loads the recent generations and this
 * narrows them instantly.
 */
export default function GalleryGrid({ items }: { items: Generation[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const counts = useMemo(
    () => ({
      all: items.length,
      image: items.filter((i) => i.type === "image").length,
      video: items.filter((i) => i.type === "video").length,
    }),
    [items],
  );

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return items.filter(
      (i) =>
        (filter === "all" || i.type === filter) &&
        (query === "" || (i.prompt ?? "").toLowerCase().includes(query)),
    );
  }, [items, filter, q]);

  const TABS: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "image", label: "Images" },
    { id: "video", label: "Video" },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setFilter(t.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                filter === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
              }`}
            >
              {t.label} <span className="text-slate-400">{counts[t.id]}</span>
            </button>
          ))}
        </div>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search prompts…"
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-boss-violet/60 sm:w-64"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">
          {q.trim() ? `No generations match "${q.trim()}".` : "No generations of this type yet."}
        </div>
      ) : (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {filtered.map((g) => (
            <figure key={g.id} className="group overflow-hidden rounded-xl border border-slate-200 bg-white" title={g.prompt}>
              {g.type === "video" ? (
                <video src={g.media_url} muted loop playsInline className="aspect-video w-full object-cover" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={g.media_url} alt={g.prompt} className="aspect-video w-full object-cover" />
              )}
              <figcaption className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11px] text-slate-500">
                <span className="capitalize">{g.type}</span>
                <a
                  href={g.media_url}
                  download
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-boss-gold opacity-0 transition group-hover:opacity-100"
                >
                  ↓
                </a>
              </figcaption>
            </figure>
          ))}
        </section>
      )}
    </div>
  );
}
