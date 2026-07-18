"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Heart, Trash2 } from "lucide-react";

type Favorite = {
  id: string;
  propertyId: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  propertyType: string | null;
  photoUrl: string | null;
  createdAt: string;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "unauthenticated" }
  | { kind: "ready"; favorites: Favorite[] }
  | { kind: "error"; msg: string };

function money(v: number | null): string {
  if (v === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);
}

export default function FavoritesClient() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  async function load() {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/consumer/favorites");
      if (res.status === 401) {
        setState({ kind: "unauthenticated" });
        return;
      }
      const data = (await res.json()) as { ok?: boolean; favorites?: Favorite[]; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Load failed");
      setState({ kind: "ready", favorites: data.favorites ?? [] });
    } catch (e) {
      setState({ kind: "error", msg: e instanceof Error ? e.message : "Load failed" });
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function remove(propertyId: string) {
    await fetch(`/api/consumer/favorites/${encodeURIComponent(propertyId)}`, {
      method: "DELETE",
    });
    await load();
  }

  if (state.kind === "loading") return <div className="text-sm text-slate-500">Loading…</div>;

  if (state.kind === "unauthenticated") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <h2 className="text-base font-semibold text-slate-900">Sign in to view favorites</h2>
        <p className="mt-2 text-sm text-slate-600">
          Save listings you love and get notified when similar ones come on market.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Link
            href="/login?next=/account/favorites"
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            Sign in
          </Link>
          <Link
            href="/signup?next=/account/favorites"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700"
          >
            Sign up
          </Link>
        </div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {state.msg}
      </div>
    );
  }

  if (state.favorites.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
        <Heart className="mx-auto h-8 w-8 text-slate-300" aria-hidden />
        <h2 className="mt-3 text-base font-semibold text-slate-900">No favorites yet</h2>
        <p className="mt-2 text-sm text-slate-600">
          Browse listings on{" "}
          <Link href="/search" className="font-medium text-[#0066b3] hover:underline">
            Homes in Your Budget
          </Link>{" "}
          and tap the heart to save.
        </p>
      </div>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {state.favorites.map((f) => (
        <li
          key={f.id}
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="relative h-40 bg-slate-100">
            {f.photoUrl ? (
              <img
                src={f.photoUrl}
                alt={f.address ?? ""}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                No photo
              </div>
            )}
            <button
              type="button"
              onClick={() => remove(f.propertyId)}
              aria-label="Remove from favorites"
              className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-red-600 shadow-sm hover:bg-white"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="p-3">
            <div className="text-lg font-semibold text-slate-900">{money(f.price)}</div>
            <div className="mt-0.5 truncate text-sm text-slate-600">
              {f.address ?? "Address unavailable"}
            </div>
            {(f.beds || f.baths || f.sqft) && (
              <div className="mt-1 text-xs text-slate-500">
                {[
                  f.beds ? `${f.beds} bd` : null,
                  f.baths ? `${f.baths} ba` : null,
                  f.sqft ? `${f.sqft.toLocaleString()} sqft` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            )}
            <div className="mt-3">
              {/* AI-sourced favorites store the external listing URL as the
                  propertyId, so link out to it. Legacy favorites (old RentCast
                  ids) have no working destination — the internal PDP is gone —
                  so render plain, non-clickable text instead of a 404 link. */}
              {/^https?:\/\//i.test(f.propertyId) ? (
                <a
                  href={f.propertyId}
                  target="_blank"
                  rel="noopener nofollow"
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#0066b3] hover:underline"
                >
                  View listing ↗
                </a>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                  Listing link unavailable
                </span>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
