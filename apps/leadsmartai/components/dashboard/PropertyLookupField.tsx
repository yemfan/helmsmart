"use client";

import { Search } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { detectPlatform, platformLabel } from "@/lib/listingUrl";

/** What a lookup can fill in. Every field is optional — the sources are
 *  best-effort, and a half-filled form beats a wrong one. */
export type PropertyLookupResult = {
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  listPrice: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  propertyType: string | null;
};

type Status =
  | { tone: "idle" }
  | { tone: "working"; text: string }
  | { tone: "ok"; text: string }
  | { tone: "warn"; text: string };

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** First non-null value for any of `keys` on a loosely-typed blob. */
function pick(blob: unknown, ...keys: string[]): unknown {
  if (!blob || typeof blob !== "object") return null;
  const rec = blob as Record<string, unknown>;
  for (const k of keys) {
    if (rec[k] != null) return rec[k];
  }
  return null;
}

/**
 * "Paste a link or type an address" — the fast way into a property form.
 *
 * The listing form could already be pre-filled from a signed RLA PDF, which is
 * perfect once a listing agreement exists and useless before one does. Most of
 * the time the agent has the listing open in another tab, or just knows the
 * address, and was retyping street / city / state / zip / price by hand.
 *
 * Two sources behind one box, chosen by what was pasted:
 *   - a Zillow / Redfin / Realtor.com / Compass link → `/api/property/from-listing`,
 *     which scrapes the listing page and merges it with the AI property lookup
 *   - anything else is treated as an address → `/api/property/{address}`
 *
 * The address route can reach a live AI + web-search lookup on a cache miss and
 * take the better part of a minute, so the waiting copy says so rather than
 * leaving a spinner to imply something is broken.
 */
export default function PropertyLookupField({
  onResolved,
  disabled,
}: {
  /** Called with whatever could be resolved. Callers fill only their EMPTY
   *  fields from it — a lookup should never overwrite something typed. */
  onResolved: (result: PropertyLookupResult) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation("dashboard");
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<Status>({ tone: "idle" });
  /** What the lookup found about the property itself. The form has no fields
   *  for beds / baths / sqft, so without this the agent has no way to tell
   *  whether the row that came back is actually their listing. */
  const [facts, setFacts] = useState<PropertyLookupResult | null>(null);
  const [busy, setBusy] = useState(false);

  const platform = detectPlatform(value.trim());

  async function lookup() {
    const raw = value.trim();
    if (!raw || busy) return;
    setBusy(true);
    try {
      const result = platform ? await fromListingUrl(raw) : await fromAddress(raw);
      if (!result) return;
      onResolved(result);
    } finally {
      setBusy(false);
    }
  }

  async function fromListingUrl(url: string): Promise<PropertyLookupResult | null> {
    const label = platform ? platformLabel(platform) : "";
    setStatus({ tone: "working", text: t("pages.propertyLookup.readingListing", { site: label }) });
    try {
      const res = await fetch(`/api/property/from-listing?url=${encodeURIComponent(url)}`, {
        cache: "no-store",
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        address?: string | null;
        data?: unknown;
        error?: string;
      };
      if (!res.ok || !body.ok || !body.address) {
        setStatus({ tone: "warn", text: t("pages.propertyLookup.listingFailed", { site: label }) });
        return null;
      }
      const d = body.data;
      const out: PropertyLookupResult = {
        address: body.address,
        city: str(pick(d, "city")),
        state: str(pick(d, "state")),
        zip: str(pick(d, "zip", "zip_code", "zipCode")),
        listPrice: num(pick(d, "price", "list_price", "listPrice")),
        beds: num(pick(d, "beds")),
        baths: num(pick(d, "baths")),
        sqft: num(pick(d, "sqft")),
        yearBuilt: num(pick(d, "year_built", "yearBuilt")),
        propertyType: str(pick(d, "property_type", "propertyType")),
      };
      setFacts(out);
      setStatus({ tone: "ok", text: t("pages.propertyLookup.filledFrom", { site: label }) });
      return out;
    } catch {
      setStatus({ tone: "warn", text: t("pages.propertyLookup.listingFailed", { site: label }) });
      return null;
    }
  }

  async function fromAddress(address: string): Promise<PropertyLookupResult | null> {
    setStatus({ tone: "working", text: t("pages.propertyLookup.lookingUpAddress") });
    try {
      const res = await fetch(`/api/property/${encodeURIComponent(address)}`, {
        cache: "no-store",
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        property?: Record<string, unknown> | null;
        latest_snapshot?: Record<string, unknown> | null;
      };
      if (!res.ok || !body.property) {
        setStatus({ tone: "warn", text: t("pages.propertyLookup.addressNotFound") });
        return null;
      }
      const p = body.property;
      const out: PropertyLookupResult = {
        address: str(p.address) ?? address,
        city: str(p.city),
        state: str(p.state),
        zip: str(p.zip_code),
        // The warehouse table carries no price column of its own; the value
        // lives on the newest snapshot.
        listPrice: num(pick(body.latest_snapshot, "estimated_value")),
        beds: num(p.beds),
        baths: num(p.baths),
        sqft: num(p.sqft),
        yearBuilt: num(p.year_built),
        propertyType: str(p.property_type),
      };
      setFacts(out);
      setStatus({ tone: "ok", text: t("pages.propertyLookup.filledFromRecords") });
      return out;
    } catch {
      setStatus({ tone: "warn", text: t("pages.propertyLookup.addressNotFound") });
      return null;
    }
  }

  const toneClass =
    status.tone === "ok"
      ? "text-emerald-700"
      : status.tone === "warn"
        ? "text-amber-700"
        : "text-slate-500";

  return (
    <div>
      <label className="block text-xs font-medium text-slate-700">
        {t("pages.propertyLookup.label")}
      </label>
      <div className="mt-1 flex gap-2">
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setStatus({ tone: "idle" });
            setFacts(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void lookup();
            }
          }}
          placeholder={t("pages.propertyLookup.placeholder")}
          disabled={disabled || busy}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
        />
        <button
          type="button"
          onClick={() => void lookup()}
          disabled={disabled || busy || !value.trim()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Search className="h-4 w-4" aria-hidden />
          {busy ? t("pages.propertyLookup.working") : t("pages.propertyLookup.lookUp")}
        </button>
      </div>
      <p className={`mt-1.5 text-[11px] ${toneClass}`}>
        {status.tone === "idle"
          ? platform
            ? t("pages.propertyLookup.detected", { site: platformLabel(platform) })
            : t("pages.propertyLookup.hint")
          : status.text}
      </p>

      {/* What came back about the property. The form itself has nowhere to put
          beds / baths / sqft, and without seeing them the agent can't tell a
          correct match from a same-street neighbour. */}
      {facts && detailChips(facts, t).length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {detailChips(facts, t).map((chip) => (
            <span
              key={chip}
              className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700"
            >
              {chip}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** The found facts, as short chips. Skips anything the sources didn't return —
 *  an empty chip is worse than one fewer chip. */
function detailChips(
  f: PropertyLookupResult,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string[] {
  const chips: string[] = [];
  if (f.propertyType) chips.push(f.propertyType);
  if (f.beds != null) chips.push(t("pages.propertyLookup.beds", { count: f.beds }));
  if (f.baths != null) chips.push(t("pages.propertyLookup.baths", { count: f.baths }));
  if (f.sqft != null) {
    chips.push(t("pages.propertyLookup.sqft", { value: f.sqft.toLocaleString() }));
  }
  if (f.yearBuilt != null) chips.push(t("pages.propertyLookup.built", { year: f.yearBuilt }));
  if (f.listPrice != null) chips.push(`$${Math.round(f.listPrice).toLocaleString()}`);
  return chips;
}
