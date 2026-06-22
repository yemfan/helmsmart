"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { HouseListing, HouseSearchResult } from "@/lib/house-search/types";

type ReachableContact = { id: string; name: string; phone: string; email: string };

function money(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "Price on request";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function metaLine(l: HouseListing): string {
  const parts: string[] = [];
  if (l.beds != null) parts.push(`${l.beds} bd`);
  if (l.baths != null) parts.push(`${l.baths} ba`);
  if (l.sqft) parts.push(`${l.sqft.toLocaleString()} sqft`);
  if (l.propertyType) parts.push(l.propertyType);
  if (l.yearBuilt) parts.push(`built ${l.yearBuilt}`);
  return parts.join(" · ");
}

export default function HouseSearchClient() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HouseSearchResult | null>(null);

  // Refinement checkboxes (suggested by the AI) — checked labels get
  // appended to the next search run.
  const [checkedRefinements, setCheckedRefinements] = useState<Set<string>>(new Set());

  // Per-listing selection for the email-to-buyer step (default: all).
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const runSearch = useCallback(
    async (refinements: string[]) => {
      const brief = query.trim();
      if (!brief) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/dashboard/house-search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query: brief, refinements }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          result?: HouseSearchResult;
          error?: string;
        };
        if (!res.ok || data.ok === false || !data.result) {
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        setResult(data.result);
        // Select all returned listings by default.
        setSelected(new Set(data.result.listings.map((_, i) => i)));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Search failed");
      } finally {
        setLoading(false);
      }
    },
    [query],
  );

  const onSearch = useCallback(() => {
    setCheckedRefinements(new Set());
    void runSearch([]);
  }, [runSearch]);

  const onRefine = useCallback(() => {
    const labels = (result?.refinements ?? [])
      .filter((r) => checkedRefinements.has(r.id))
      .map((r) => r.label);
    void runSearch(labels);
  }, [result, checkedRefinements, runSearch]);

  return (
    <div className="space-y-6">
      {/* Query */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label htmlFor="hs-query" className="text-sm font-semibold text-slate-900">
          What is your buyer looking for?
        </label>
        <textarea
          id="hs-query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          rows={3}
          placeholder="e.g. 3 bed / 2 bath single-family in Pasadena under $1.2M, big backyard, good schools, move-in ready"
          className="mt-2 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
          disabled={loading}
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-xs text-slate-400">
            Searches the live web — results take up to a minute.
          </span>
          <button
            type="button"
            onClick={onSearch}
            disabled={loading || query.trim().length === 0}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </div>
        {error ? (
          <p className="mt-3 text-sm text-rose-600">{error}</p>
        ) : null}
      </section>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-600">
          Searching the web for matching listings… this can take up to a minute.
        </div>
      ) : null}

      {result && !loading ? (
        <>
          {/* Interpretation + refinements */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">How I read this</h2>
            <p className="mt-1 text-sm text-slate-600">{result.interpreted}</p>
            {result.criteria.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-2">
                {result.criteria.map((c, i) => (
                  <li
                    key={i}
                    className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-700"
                  >
                    {c}
                  </li>
                ))}
              </ul>
            ) : null}

            {result.refinements.length > 0 ? (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Refine the search
                </h3>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {result.refinements.map((r) => (
                    <label key={r.id} className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={checkedRefinements.has(r.id)}
                        onChange={(e) => {
                          setCheckedRefinements((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(r.id);
                            else next.delete(r.id);
                            return next;
                          });
                        }}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                      />
                      {r.label}
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={onRefine}
                  disabled={checkedRefinements.size === 0}
                  className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Refine search ({checkedRefinements.size})
                </button>
              </div>
            ) : null}
          </section>

          {/* Listings */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">
                {result.listings.length} {result.listings.length === 1 ? "listing" : "listings"}
              </h2>
              <span className="text-xs text-slate-500">{selected.size} selected</span>
            </header>

            {result.listings.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-slate-500">
                No real listings matched. Try loosening the criteria.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {result.listings.map((l, i) => (
                  <li key={i} className="flex items-start gap-3 px-5 py-4">
                    <input
                      type="checkbox"
                      checked={selected.has(i)}
                      onChange={(e) => {
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(i);
                          else next.delete(i);
                          return next;
                        });
                      }}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate text-sm font-semibold text-slate-900">{l.address}</p>
                        <p className="shrink-0 text-sm font-bold tabular-nums text-slate-900">
                          {money(l.price)}
                        </p>
                      </div>
                      {metaLine(l) ? (
                        <p className="mt-0.5 text-xs text-slate-500">{metaLine(l)}</p>
                      ) : null}
                      {l.matchReason ? (
                        <p className="mt-1 text-xs text-slate-600">{l.matchReason}</p>
                      ) : null}
                      {l.listingUrl ? (
                        <a
                          href={l.listingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-block text-xs font-semibold text-emerald-700 hover:underline"
                        >
                          View listing ↗
                        </a>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {result.disclaimer ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
              {result.disclaimer}
            </p>
          ) : null}

          {result.listings.length > 0 ? (
            <EmailToBuyer
              query={query}
              listings={result.listings}
              selectedIdx={selected}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

// ── Email-to-buyer panel ───────────────────────────────────────────

function EmailToBuyer({
  query,
  listings,
  selectedIdx,
}: {
  query: string;
  listings: HouseListing[];
  selectedIdx: Set<number>;
}) {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState<ReachableContact[]>([]);
  const [contactId, setContactId] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/dashboard/contacts/reachable", { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as { contacts?: ReachableContact[] };
        if (!cancelled) setContacts((data.contacts ?? []).filter((c) => c.email));
      } catch {
        /* manual entry still works */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const selectedListings = useMemo(
    () => listings.filter((_, i) => selectedIdx.has(i)),
    [listings, selectedIdx],
  );

  const onPickContact = useCallback(
    (id: string) => {
      setContactId(id);
      const c = contacts.find((x) => x.id === id);
      if (c) {
        setEmail(c.email);
        setFirstName((c.name || "").split(/\s+/)[0] || "");
      }
    },
    [contacts],
  );

  const onSend = useCallback(async () => {
    setSending(true);
    setStatus(null);
    try {
      const res = await fetch("/api/dashboard/house-search/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          to: email.trim(),
          buyerFirstName: firstName.trim() || null,
          query,
          note: note.trim() || null,
          listings: selectedListings,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || data.ok === false) throw new Error(data.error ?? `HTTP ${res.status}`);
      setStatus({ kind: "ok", msg: `Sent ${selectedListings.length} listing${selectedListings.length === 1 ? "" : "s"} to ${email.trim()}.` });
    } catch (e) {
      setStatus({ kind: "err", msg: e instanceof Error ? e.message : "Send failed" });
    } finally {
      setSending(false);
    }
  }, [email, firstName, note, query, selectedListings]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
      >
        ✉ Email to buyer
      </button>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">
          Email {selectedListings.length} listing{selectedListings.length === 1 ? "" : "s"} to buyer
        </h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs font-semibold text-slate-500 hover:text-slate-700"
        >
          Cancel
        </button>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold text-slate-700">Buyer (from contacts)</span>
          <select
            value={contactId}
            onChange={(e) => onPickContact(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
          >
            <option value="">— Select a contact —</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.email})
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-700">First name</span>
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="optional"
            className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs font-semibold text-slate-700">Email address</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="buyer@example.com"
            className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs font-semibold text-slate-700">Personal note (optional)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="A quick line to your buyer…"
            className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
          />
        </label>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="min-h-[20px] text-xs">
          {status ? (
            <span className={status.kind === "ok" ? "text-emerald-700" : "text-rose-600"}>
              {status.msg}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onSend}
          disabled={sending || selectedListings.length === 0 || email.trim().length === 0}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {sending ? "Sending…" : "Send email"}
        </button>
      </div>
    </section>
  );
}
