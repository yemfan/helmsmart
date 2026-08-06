"use client";

/**
 * Connect / disconnect social channels — the actions moved off /social into
 * Settings → Marketing. Connect is an OAuth redirect; disconnect deletes the
 * stored grant via a server action.
 */

import { useState, useTransition } from "react";
import { CONNECTABLE_CHANNELS } from "@/lib/social-channels";
import { disconnectSocialProvider } from "@/lib/actions/social-connections";

export function SocialConnections({ connected }: { connected: string[] }) {
  const [set, setSet] = useState<Set<string>>(new Set(connected));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function disconnect(provider: string) {
    setError(null);
    start(async () => {
      const res = await disconnectSocialProvider(provider);
      if (!res.ok) {
        setError(res.error ?? "Couldn't disconnect that channel.");
        return;
      }
      setSet((prev) => {
        const next = new Set(prev);
        next.delete(provider);
        return next;
      });
    });
  }

  return (
    <div className="space-y-2">
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}
      {CONNECTABLE_CHANNELS.map((ch) => {
        const on = set.has(ch.provider);
        return (
          <div
            key={ch.provider}
            className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-2.5"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800">
                {ch.label}
                {ch.note && (
                  <span className="ml-2 text-xs font-normal text-slate-400">{ch.note}</span>
                )}
              </p>
              <p className="text-xs">
                {on ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Connected
                  </span>
                ) : (
                  <span className="text-slate-400">Not connected</span>
                )}
              </p>
            </div>
            {on ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => disconnect(ch.provider)}
                className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
              >
                Disconnect
              </button>
            ) : (
              <a
                href={ch.connectPath}
                className="shrink-0 rounded-lg border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
              >
                Connect
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}
