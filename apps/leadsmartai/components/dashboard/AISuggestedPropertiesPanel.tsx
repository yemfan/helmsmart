"use client";

import { useState } from "react";
import { RefreshCw, Send, Sparkles } from "lucide-react";

type Candidate = {
  listing: {
    id: string;
    address: string;
    city: string | null;
    state: string | null;
    zip: string | null;
    price: number | null;
    beds: number | null;
    baths: number | null;
    sqft: number | null;
    propertyType: string | null;
    photoUrl: string | null;
  };
  score: number;
  rationale: string;
  matchReasons: string[];
};

type Context = {
  favoriteCount: number;
  savedSearchCount: number;
  viewedCount: number;
  priceRange: { min: number | null; max: number | null };
  preferredCities: string[];
  usedLlm: boolean;
};

type Props = {
  contactId: string;
  contactFirstName: string | null;
};

function money(v: number | null): string {
  if (v === null) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${Math.round(v)}`;
}

/**
 * On-demand AI recommender panel. Collapsed by default — button opens
 * and fetches. Agent can select candidates → "Send selected" pipes
 * them into the D2 recommendation send flow via POST to the same
 * /contacts/[id]/recommendations endpoint.
 */
export default function AISuggestedPropertiesPanel({
  contactId,
  contactFirstName,
}: Props) {
  const [state, setState] = useState<
    | { kind: "closed" }
    | { kind: "loading" }
    | { kind: "ready"; candidates: Candidate[]; context: Context }
    | { kind: "error"; msg: string }
  >({ kind: "closed" });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  async function load() {
    setState({ kind: "loading" });
    setPicked(new Set());
    try {
      const res = await fetch(
        `/api/dashboard/contacts/${encodeURIComponent(contactId)}/suggested-properties`,
        { method: "POST" },
      );
      const data = (await res.json()) as {
        ok?: boolean;
        candidates?: Candidate[];
        context?: Context;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error || "Load failed");
      setState({
        kind: "ready",
        candidates: data.candidates ?? [],
        context: data.context ?? {
          favoriteCount: 0,
          savedSearchCount: 0,
          viewedCount: 0,
          priceRange: { min: null, max: null },
          preferredCities: [],
          usedLlm: false,
        },
      });
    } catch (e) {
      setState({ kind: "error", msg: e instanceof Error ? e.message : "Load failed" });
    }
  }

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function sendSelected() {
    if (state.kind !== "ready" || picked.size === 0) return;
    setSending(true);
    try {
      const picks = state.candidates.filter((c) => picked.has(c.listing.id));
      const listings = picks.map((c) => ({
        propertyId: c.listing.id,
        address: c.listing.address,
        city: c.listing.city ?? undefined,
        state: c.listing.state ?? undefined,
        zip: c.listing.zip ?? undefined,
        price: c.listing.price ?? undefined,
        beds: c.listing.beds ?? undefined,
        baths: c.listing.baths ?? undefined,
        sqft: c.listing.sqft ?? undefined,
        propertyType: c.listing.propertyType ?? undefined,
        photoUrl: c.listing.photoUrl ?? undefined,
      }));
      const noteLines = picks
        .map((c) => `• ${c.listing.address} — ${c.rationale}`)
        .join("\n");
      const res = await fetch(
        `/api/dashboard/contacts/${encodeURIComponent(contactId)}/recommendations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: "Homes I picked for you",
            note: contactFirstName
              ? `Hi ${contactFirstName},\n\nBased on what you've been looking at, thought these might be worth a look:\n\n${noteLines}\n\n— Your agent`
              : `Based on your recent activity, I picked these out:\n\n${noteLines}`,
            listings,
          }),
        },
      );
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Send failed");
      setPicked(new Set());
      // Refresh list so "sent" ones don't reappear immediately — next
      // call will run a fresh AI listing search anyway.
      setState((prev) => (prev.kind === "ready" ? prev : prev));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Sparkles className="h-4 w-4 text-indigo-500" aria-hidden />
            AI-suggested properties
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Listings that match this contact&apos;s favorites, saved searches,
            and recent activity. Review + send with one click.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={state.kind === "loading"}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${state.kind === "loading" ? "animate-spin" : ""}`} aria-hidden />
          {state.kind === "closed" ? "Suggest" : state.kind === "loading" ? "Thinking…" : "Refresh"}
        </button>
      </div>

      {state.kind === "loading" && (
        <div className="mt-3 text-xs text-gray-400">
          Searching live listings and scoring against their pattern…
        </div>
      )}

      {state.kind === "error" && (
        <div className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {state.msg}
        </div>
      )}

      {state.kind === "ready" && (
        <>
          <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-gray-500">
            <span className="rounded bg-gray-50 px-1.5 py-0.5">
              {state.context.favoriteCount} favorites
            </span>
            <span className="rounded bg-gray-50 px-1.5 py-0.5">
              {state.context.savedSearchCount} saved searches
            </span>
            {state.context.usedLlm && (
              <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-700">
                LLM rationale
              </span>
            )}
          </div>

          {state.candidates.length === 0 ? (
            <div className="mt-3 rounded border border-dashed border-gray-200 p-4 text-center text-xs text-gray-500">
              No candidates to suggest yet — contact needs favorites or a
              saved search to seed the recommender.
            </div>
          ) : (
            <>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {state.candidates.map((c) => {
                  const isPicked = picked.has(c.listing.id);
                  return (
                    <li key={c.listing.id}>
                      <button
                        type="button"
                        onClick={() => toggle(c.listing.id)}
                        className={`flex w-full items-start gap-3 rounded-lg border p-2 text-left transition-colors ${
                          isPicked
                            ? "border-emerald-300 bg-emerald-50"
                            : "border-gray-200 bg-white hover:border-gray-300"
                        }`}
                      >
                        {c.listing.photoUrl ? (
                          <img
                            src={c.listing.photoUrl}
                            alt=""
                            className="h-16 w-16 shrink-0 rounded object-cover"
                          />
                        ) : (
                          <div className="h-16 w-16 shrink-0 rounded bg-gray-100" />
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold text-gray-900">
                              {money(c.listing.price)}
                            </span>
                            <span className="rounded bg-gray-100 px-1 py-0.5 text-[9px] font-medium text-gray-600">
                              {c.score}
                            </span>
                          </div>
                          <div className="truncate text-xs text-gray-600">
                            {c.listing.address}
                          </div>
                          <div className="mt-0.5 text-[10px] text-gray-400">
                            {[
                              c.listing.beds ? `${c.listing.beds}bd` : null,
                              c.listing.baths ? `${c.listing.baths}ba` : null,
                              c.listing.sqft ? `${c.listing.sqft.toLocaleString()}sf` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                          <div className="mt-1 text-[11px] italic text-indigo-700">
                            {c.rationale}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  {picked.size} selected
                </span>
                <button
                  type="button"
                  onClick={sendSelected}
                  disabled={picked.size === 0 || sending}
                  className="inline-flex items-center gap-1 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" aria-hidden />
                  {sending ? "Sending…" : `Send ${picked.size || ""}`}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
