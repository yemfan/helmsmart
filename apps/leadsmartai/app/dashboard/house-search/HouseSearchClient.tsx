"use client";

import { useTranslation } from "react-i18next";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { HouseListing, HouseSearchResult } from "@/lib/house-search/types";

type ReachableContact = { id: string; name: string; phone: string; email: string };

type SavedSearchListItem = {
  id: string;
  contactId: string;
  name: string;
  query: string;
  runCount?: number;
  latestRun?: { id: string; listingCount: number; createdAt: string } | null;
  updatedAt: string;
};

/** The saved search the current results are attached to (runs append to it). */
type TrackedSearch = {
  id: string;
  name: string;
  contactId: string;
  runCount: number;
  autoRun: boolean;
  autoRunFrequency: string | null;
};

type HouseSearchQuota = {
  used: number;
  limit: number | null;
  remaining: number | null;
  reached: boolean;
  warning: boolean;
  unlimited: boolean;
  resetDate: string;
};

function money(n: number | null, t: (k: string) => string): string {
  if (n == null || !Number.isFinite(n)) return t("houseSearch.priceOnRequest");
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function buyerNameFor(contacts: ReachableContact[], contactId: string): string {
  return contacts.find((c) => c.id === contactId)?.name || "the buyer";
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
  const { t } = useTranslation("dashboard");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HouseSearchResult | null>(null);
  const [quota, setQuota] = useState<HouseSearchQuota | null>(null);

  // Refinement checkboxes (suggested by the AI) — checked labels get
  // appended to the next search run.
  const [checkedRefinements, setCheckedRefinements] = useState<Set<string>>(new Set());

  // Per-listing selection for the email-to-buyer step (default: all).
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Reachable contacts (for save/load by contact).
  const [contacts, setContacts] = useState<ReachableContact[]>([]);
  // The saved search the current result is attached to — runs append to it.
  const [tracked, setTracked] = useState<TrackedSearch | null>(null);

  // Daily-quota hint on load.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/dashboard/house-search/quota", { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; quota?: HouseSearchQuota };
        if (!cancelled && data.ok && data.quota) setQuota(data.quota);
      } catch {
        /* non-fatal — the pill just won't render */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load reachable contacts once (for save/load by contact).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/dashboard/contacts/reachable", { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as { contacts?: ReachableContact[] };
        if (!cancelled) setContacts(data.contacts ?? []);
      } catch {
        /* save/load just won't have a picker */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
          quota?: HouseSearchQuota;
        };
        if (data.quota) setQuota(data.quota);
        if (!res.ok || data.ok === false || !data.result) {
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        setResult(data.result);
        // Select all returned listings by default.
        setSelected(new Set(data.result.listings.map((_, i) => i)));
        // If this search is attached to a saved one, append the run (history).
        if (tracked) {
          try {
            const r = await fetch(`/api/dashboard/house-search/saved/${encodeURIComponent(tracked.id)}`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ refinements, result: data.result, trigger: "refine" }),
            });
            if (r.ok) setTracked((t) => (t ? { ...t, runCount: t.runCount + 1 } : t));
          } catch {
            /* non-fatal — the result still shows; it just wasn't appended */
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : t("houseSearch.searchFailed"));
      } finally {
        setLoading(false);
      }
    },
    [query, tracked],
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

  // Open a saved search: load its latest run into the view and attach to it so
  // subsequent searches/refinements append to its history.
  const loadSavedSearch = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/house-search/saved/${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        search?: {
          id: string;
          name: string;
          contactId: string;
          query: string;
          autoRun?: boolean;
          autoRunFrequency?: string | null;
        };
        runs?: Array<{ result: HouseSearchResult }>;
        error?: string;
      };
      if (!res.ok || data.ok === false || !data.search) throw new Error(data.error ?? `HTTP ${res.status}`);
      const runs = data.runs ?? [];
      const latest = runs[0]?.result ?? null;
      setQuery(data.search.query);
      setCheckedRefinements(new Set());
      if (latest) {
        setResult(latest);
        setSelected(new Set(latest.listings.map((_, i) => i)));
      }
      setTracked({
        id: data.search.id,
        name: data.search.name,
        contactId: data.search.contactId,
        runCount: runs.length,
        autoRun: data.search.autoRun === true,
        autoRunFrequency: data.search.autoRunFrequency ?? null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("houseSearch.loadSavedFailed"));
    } finally {
      setLoading(false);
    }
  }, []);

  // Schedule (or stop) the agent-requested auto-run + buyer email.
  const setSchedule = useCallback(async (value: "off" | "daily" | "weekly") => {
    if (!tracked) return;
    const autoRun = value !== "off";
    const autoRunFrequency = autoRun ? value : null;
    // Optimistic; revert on error.
    const prev = tracked;
    setTracked({ ...tracked, autoRun, autoRunFrequency });
    try {
      const res = await fetch(`/api/dashboard/house-search/saved/${encodeURIComponent(tracked.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ autoRun, autoRunFrequency }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      setTracked(prev);
      setError(t("houseSearch.scheduleFailed"));
    }
  }, [tracked]);

  return (
    <div className="space-y-6">
      {/* Query */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <label htmlFor="hs-query" className="text-sm font-semibold text-slate-900">
            What is your buyer looking for?
          </label>
          {quota ? <QuotaPill quota={quota} /> : null}
        </div>
        <textarea
          id="hs-query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          rows={3}
          placeholder={t("houseSearch.placeholder")}
          className="mt-2 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
          disabled={loading}
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-xs text-slate-400">
            {quota?.reached
              ? t("houseSearch.limitReached")
              : t("houseSearch.limitNote")}
          </span>
          <button
            type="button"
            onClick={onSearch}
            disabled={loading || query.trim().length === 0 || quota?.reached === true}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? t("houseSearch.searching") : t("houseSearch.search")}
          </button>
        </div>
        {error ? (
          <p className="mt-3 text-sm text-rose-600">{error}</p>
        ) : null}
      </section>

      {/* Saved searches for a contact */}
      <SavedSearchesPanel contacts={contacts} onLoad={loadSavedSearch} activeId={tracked?.id ?? null} />

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-600">
          Searching the web for matching listings… this can take up to a minute.
        </div>
      ) : null}

      {result && !loading ? (
        <>
          {/* Save to a contact, or the tracked-search banner */}
          {tracked ? (
            <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  Saved as <strong>{tracked.name}</strong> · {tracked.runCount} run{tracked.runCount === 1 ? "" : "s"}.
                  New searches &amp; refinements are added to its history.
                </span>
                <button
                  type="button"
                  onClick={() => setTracked(null)}
                  className="shrink-0 text-xs font-semibold text-emerald-800 underline hover:text-emerald-950"
                >
                  Detach
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-emerald-200 pt-3">
                <label className="text-xs font-semibold text-emerald-900">{t("houseSearch.autoSend")}</label>
                <select
                  value={tracked.autoRun ? tracked.autoRunFrequency ?? "daily" : "off"}
                  onChange={(e) => void setSchedule(e.target.value as "off" | "daily" | "weekly")}
                  className="rounded-lg border border-emerald-300 bg-white px-2 py-1 text-xs font-medium text-slate-700"
                >
                  <option value="off">{t("houseSearch.off")}</option>
                  <option value="daily">{t("houseSearch.daily")}</option>
                  <option value="weekly">{t("houseSearch.weekly")}</option>
                </select>
                <span className="text-xs text-emerald-800">
                  {tracked.autoRun
                    ? `Emails ${buyerNameFor(contacts, tracked.contactId)} new matches ${tracked.autoRunFrequency === "weekly" ? "weekly" : "daily"}.`
                    : `Schedule re-runs that email ${buyerNameFor(contacts, tracked.contactId)} only the new listings.`}
                </span>
              </div>
            </div>
          ) : (
            <SaveToContactPanel
              contacts={contacts}
              query={query}
              result={result}
              refinements={(result.refinements ?? [])
                .filter((r) => checkedRefinements.has(r.id))
                .map((r) => r.label)}
              onSaved={(t) => setTracked(t)}
            />
          )}

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
                          {money(l.price, t)}
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

function QuotaPill({ quota }: { quota: HouseSearchQuota }) {
  const tone = quota.reached
    ? "bg-rose-50 text-rose-700 ring-rose-200"
    : quota.warning
      ? "bg-amber-50 text-amber-700 ring-amber-200"
      : "bg-slate-50 text-slate-700 ring-slate-200";
  return (
    <span
      className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold ring-1 ${tone}`}
      title={`Daily House Search quota — resets ${quota.resetDate}`}
    >
      {quota.unlimited ? "Unlimited searches" : `${quota.remaining} of ${quota.limit} left today`}
    </span>
  );
}

// ── Saved searches by contact ──────────────────────────────────────

function SavedSearchesPanel({
  contacts,
  onLoad,
  activeId,
}: {
  contacts: ReachableContact[];
  onLoad: (id: string) => void;
  activeId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [contactId, setContactId] = useState("");
  const [items, setItems] = useState<SavedSearchListItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (cid: string) => {
    setContactId(cid);
    setItems(null);
    if (!cid) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/house-search/saved?contactId=${encodeURIComponent(cid)}`, {
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; searches?: SavedSearchListItem[] };
      setItems(data.ok && Array.isArray(data.searches) ? data.searches : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-slate-500 hover:text-slate-700"
      >
        + Saved searches by contact
      </button>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Saved searches</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs font-semibold text-slate-500 hover:text-slate-700"
        >
          Close
        </button>
      </div>
      <label className="mt-2 block">
        <span className="text-xs font-semibold text-slate-700">Contact</span>
        <select
          value={contactId}
          onChange={(e) => void load(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
        >
          <option value="">— Select a contact —</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {loading ? <p className="mt-3 text-xs text-slate-500">Loading…</p> : null}
      {items && items.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500">No saved searches for this contact yet.</p>
      ) : null}
      {items && items.length > 0 ? (
        <ul className="mt-3 divide-y divide-slate-100">
          {items.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {s.name}
                  {activeId === s.id ? " · open" : ""}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {s.runCount ?? 0} run{(s.runCount ?? 0) === 1 ? "" : "s"}
                  {s.latestRun ? ` · ${s.latestRun.listingCount} listings` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onLoad(s.id)}
                className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Open
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

// ── Save the current search to a contact ───────────────────────────

function SaveToContactPanel({
  contacts,
  query,
  result,
  refinements,
  onSaved,
}: {
  contacts: ReachableContact[];
  query: string;
  result: HouseSearchResult;
  refinements: string[];
  onSaved: (t: TrackedSearch) => void;
}) {
  const [open, setOpen] = useState(false);
  const [contactId, setContactId] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = useCallback(async () => {
    if (!contactId || !name.trim()) {
      setErr("Pick a contact and a name.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/dashboard/house-search/saved", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contactId, name: name.trim(), query, refinements, result }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        search?: { id: string; name: string; contactId: string };
        error?: string;
      };
      if (!res.ok || data.ok === false || !data.search) throw new Error(data.error ?? `HTTP ${res.status}`);
      onSaved({
        id: data.search.id,
        name: data.search.name,
        contactId: data.search.contactId,
        runCount: 1,
        autoRun: false,
        autoRunFrequency: null,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [contactId, name, query, refinements, result, onSaved]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setName(query.slice(0, 80));
        }}
        className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
      >
        ☆ Save this search to a contact
      </button>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Save search to a contact</h2>
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
          <span className="text-xs font-semibold text-slate-700">Contact</span>
          <select
            value={contactId}
            onChange={(e) => setContactId(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
          >
            <option value="">— Select a contact —</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-700">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Pasadena 3bd under $1.2M"
            className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
          />
        </label>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="min-h-[20px] text-xs text-rose-600">{err ?? ""}</span>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !contactId || !name.trim()}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save search"}
        </button>
      </div>
    </section>
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
