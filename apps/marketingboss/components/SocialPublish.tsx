"use client";

import { useState } from "react";

export type SocialStatus = {
  /** provider key (meta/threads/linkedin/pinterest) → OAuth app configured */
  providersConfigured: Record<string, boolean>;
  /** platform → connected */
  connected: Record<string, boolean>;
  /** platform → account label */
  accountName: Record<string, string | null>;
};

type PubResult = { platform: string; ok: boolean; url?: string | null; error?: string };

const PROVIDERS: { key: string; platforms: { id: string; label: string }[] }[] = [
  { key: "meta", platforms: [{ id: "facebook", label: "Facebook" }, { id: "instagram", label: "Instagram" }] },
  { key: "linkedin", platforms: [{ id: "linkedin", label: "LinkedIn" }] },
  { key: "threads", platforms: [{ id: "threads", label: "Threads" }] },
  { key: "pinterest", platforms: [{ id: "pinterest", label: "Pinterest" }] },
];

export default function SocialPublish({
  url,
  defaultCaption,
  status,
}: {
  url: string;
  defaultCaption: string;
  status: SocialStatus;
}) {
  const connectedPlatforms = Object.entries(status.connected)
    .filter(([, v]) => v)
    .map(([k]) => k);

  const [caption, setCaption] = useState(defaultCaption);
  const [selected, setSelected] = useState<Set<string>>(new Set(connectedPlatforms));
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<PubResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const anyConfigured = PROVIDERS.some((p) => status.providersConfigured[p.key]);
  if (!anyConfigured) return null; // nothing set up yet — hide the whole section

  function toggle(p: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  async function publish() {
    if (busy || selected.size === 0) return;
    setBusy(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch("/api/social/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, kind: "image", caption, platforms: [...selected] }),
      });
      const data = (await res.json()) as { results?: PubResult[]; error?: string };
      if (!res.ok) throw new Error(data.error || `Publish failed (${res.status})`);
      setResults(data.results || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publish failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
      <div className="mb-2 text-xs font-medium text-slate-500">Publish to social</div>

      <div className="mb-2 flex flex-wrap gap-1.5">
        {PROVIDERS.map((prov) => {
          if (!status.providersConfigured[prov.key]) return null;
          return prov.platforms.map((pf) => {
            const isConnected = status.connected[pf.id];
            if (!isConnected) {
              return (
                <a
                  key={pf.id}
                  href={`/api/social/connect/${prov.key}`}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 transition hover:border-boss-violet/50 hover:text-slate-900"
                >
                  Connect {pf.label}
                </a>
              );
            }
            const on = selected.has(pf.id);
            return (
              <button
                key={pf.id}
                onClick={() => toggle(pf.id)}
                title={status.accountName[pf.id] ?? undefined}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  on
                    ? "border-boss-gold/50 bg-boss-gold/15 text-boss-gold"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:text-slate-900"
                }`}
              >
                {on ? "✓ " : ""}
                {pf.label}
              </button>
            );
          });
        })}
      </div>

      {connectedPlatforms.length > 0 && (
        <>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={2}
            placeholder="Write a caption…"
            className="w-full resize-y rounded-lg border border-slate-200 bg-white p-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-boss-violet/60"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-400">
              {selected.size ? `${selected.size} selected` : "Select platforms above"}
            </span>
            <button
              onClick={publish}
              disabled={busy || selected.size === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-boss-violet px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Publishing…" : "Publish"}
            </button>
          </div>
        </>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {results && (
        <ul className="mt-2 space-y-1 text-xs">
          {results.map((r) => (
            <li key={r.platform} className={r.ok ? "text-emerald-600" : "text-red-600"}>
              <span className="capitalize">{r.platform}</span>:{" "}
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
  );
}
