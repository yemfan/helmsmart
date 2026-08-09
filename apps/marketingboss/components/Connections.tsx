"use client";

import { useState } from "react";

type Status = { connected: boolean; accountName: string | null };

const PROVIDERS: {
  key: string;
  label: string;
  hint: string;
  connectPath: string;
  platforms: { id: string; label: string }[];
}[] = [
  {
    key: "meta",
    label: "Facebook & Instagram",
    hint: "Post images to your Page and linked Instagram business account.",
    connectPath: "/api/social/connect/meta",
    platforms: [
      { id: "facebook", label: "Facebook" },
      { id: "instagram", label: "Instagram" },
    ],
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    hint: "Share images to your LinkedIn feed.",
    connectPath: "/api/social/connect/linkedin",
    platforms: [{ id: "linkedin", label: "LinkedIn" }],
  },
  {
    key: "threads",
    label: "Threads",
    hint: "Post text + images to Threads.",
    connectPath: "/api/social/connect/threads",
    platforms: [{ id: "threads", label: "Threads" }],
  },
  {
    key: "pinterest",
    label: "Pinterest",
    hint: "Create pins on your board.",
    connectPath: "/api/social/connect/pinterest",
    platforms: [{ id: "pinterest", label: "Pinterest" }],
  },
  {
    key: "youtube",
    label: "YouTube",
    hint: "Publish generated videos to your channel.",
    connectPath: "/api/youtube/connect",
    platforms: [{ id: "youtube", label: "YouTube" }],
  },
  {
    key: "tiktok",
    label: "TikTok",
    hint: "Publish generated videos to your TikTok account.",
    connectPath: "/api/social/connect/tiktok",
    platforms: [{ id: "tiktok", label: "TikTok" }],
  },
];

export default function Connections({
  providersConfigured,
  statuses,
}: {
  providersConfigured: Record<string, boolean>;
  statuses: Record<string, Status>;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function disconnect(key: string) {
    if (busy) return;
    setBusy(key);
    try {
      await fetch(`/api/social/disconnect/${key}`, { method: "POST" });
      window.location.reload();
    } catch {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {PROVIDERS.map((prov) => {
        const configured = providersConfigured[prov.key];
        const connectedPlatforms = prov.platforms.filter((p) => statuses[p.id]?.connected);
        const anyConnected = connectedPlatforms.length > 0;
        const allConnected = connectedPlatforms.length === prov.platforms.length;

        return (
          <div key={prov.key} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-900">{prov.label}</span>
                {anyConnected && (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                    Connected
                  </span>
                )}
                {!configured && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">Not set up yet</span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-slate-500">{prov.hint}</p>
              {anyConnected && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {connectedPlatforms.map((p) => (
                    <span
                      key={p.id}
                      className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600"
                    >
                      {p.label}
                      {statuses[p.id]?.accountName ? ` · ${statuses[p.id]!.accountName}` : ""}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {configured && !allConnected && (
                <a
                  href={prov.connectPath}
                  className="rounded-lg bg-boss-gold px-3.5 py-2 text-sm font-semibold text-black transition hover:brightness-105"
                >
                  {anyConnected ? "Finish" : "Connect"}
                </a>
              )}
              {!configured && (
                // The OAuth app credentials for this platform aren't set on the
                // server — a live-looking button would just dead-end.
                <button
                  disabled
                  title={`${prov.label} isn't available yet — its app credentials aren't configured on the server.`}
                  className="cursor-not-allowed rounded-lg bg-slate-100 px-3.5 py-2 text-sm font-semibold text-slate-400"
                >
                  Connect
                </button>
              )}
              {anyConnected && (
                <button
                  onClick={() => disconnect(prov.key)}
                  disabled={busy === prov.key}
                  className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm text-slate-600 transition hover:text-slate-900 disabled:opacity-40"
                >
                  {busy === prov.key ? "…" : "Disconnect"}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
