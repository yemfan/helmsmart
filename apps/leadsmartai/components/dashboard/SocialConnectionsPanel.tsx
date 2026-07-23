"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Settings panel for connecting social accounts (Facebook Pages in v1).
 * Pairs with the transaction-detail "Post to Facebook" button — agents
 * connect once here, then post from any listing without re-auth.
 *
 * The OAuth callback route redirects back to /dashboard/settings with
 * `?fb_connected=1&inserted=N&updated=M` or `?fb_error=…`. The panel
 * reads those query params on mount and surfaces an inline banner.
 */

type Connection = {
  id: string;
  provider: "facebook_page";
  providerAccountId: string;
  providerAccountName: string | null;
  scopes: string[];
  tokenExpiresAt: string | null;
  connectedAt: string;
  lastUsedAt: string | null;
};

type Banner =
  | { kind: "success"; text: string }
  | { kind: "error"; text: string }
  | null;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function readBannerFromQuery(): Banner {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get("fb_connected") === "1") {
    const inserted = Number(params.get("inserted") ?? "0");
    const updated = Number(params.get("updated") ?? "0");
    const total = inserted + updated;
    if (total === 0) {
      return { kind: "success", text: "Facebook account connected — no Pages found." };
    }
    return {
      kind: "success",
      text:
        inserted > 0 && updated > 0
          ? `Connected ${inserted} new Page${inserted === 1 ? "" : "s"} and refreshed ${updated}.`
          : inserted > 0
            ? `Connected ${inserted} Page${inserted === 1 ? "" : "s"}.`
            : `Refreshed ${updated} Page${updated === 1 ? "" : "s"} token${updated === 1 ? "" : "s"}.`,
    };
  }
  const err = params.get("fb_error");
  if (err) {
    return {
      kind: "error",
      text: `Couldn't connect Facebook: ${decodeURIComponent(err)}`,
    };
  }
  return null;
}

export default function SocialConnectionsPanel() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/social/connections", {
        cache: "no-store",
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        connections?: Connection[];
        error?: string;
      };
      if (!res.ok || data.ok === false) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setConnections(data.connections ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setBanner(readBannerFromQuery());
    void refresh();
  }, [refresh]);

  const onRevoke = useCallback(
    async (id: string) => {
      setRevokingId(id);
      try {
        const res = await fetch(
          `/api/dashboard/social/connections/${encodeURIComponent(id)}`,
          { method: "DELETE", credentials: "include" },
        );
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        setConnections((cs) => cs.filter((c) => c.id !== id));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to disconnect");
      } finally {
        setRevokingId(null);
      }
    },
    [],
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-base font-semibold text-slate-900">
          Social posting
        </h2>
        <p className="mt-0.5 text-xs text-slate-600">
          Connect a Facebook Page to post listings straight from a deal&apos;s detail
          page. Tokens are stored server-side; you can disconnect any time.
        </p>
      </header>

      <div className="space-y-4 p-5">
        {banner ? (
          <div
            className={`rounded-lg border px-3 py-2 text-xs ${
              banner.kind === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            {banner.text}
          </div>
        ) : null}

        {loading ? (
          <div className="h-16 animate-pulse rounded-lg bg-slate-100" aria-hidden />
        ) : error ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {error}
          </div>
        ) : connections.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-600">
            No Pages connected yet. Connect a Facebook Page below to enable
            one-click posting from listings.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {connections.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {c.providerAccountName ?? c.providerAccountId}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Connected {formatDate(c.connectedAt)}
                    {c.lastUsedAt ? ` · last used ${formatDate(c.lastUsedAt)}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void onRevoke(c.id)}
                  disabled={revokingId === c.id}
                  className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {revokingId === c.id ? "Disconnecting…" : "Disconnect"}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="text-xs text-slate-500">
            New connection authorizes the app to read your Pages list and post on your behalf.
          </p>
          {/* Route through the IG-aware Meta flow (/api/leads-gen/connect/meta),
              NOT the legacy /api/social/facebook one — the legacy flow throws
              `state_mismatch` and never captures the linked Instagram Business
              account. This flow reads Pages via /me/accounts + the business
              portfolio edge and stores ig_business_user_id, so one grant lights
              up both Facebook and Instagram. It redirects to the connect page. */}
          <a
            href="/api/leads-gen/connect/meta/start"
            className="shrink-0 rounded-lg bg-[#1877F2] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#155FC4]"
          >
            Connect Facebook Page
          </a>
        </div>
      </div>
    </section>
  );
}
