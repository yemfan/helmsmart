"use client";

import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import ShareReport from "@/components/share/ShareReport";
import {
  detectPlatform,
  platformLabel,
  type ListingPlatform,
} from "@/lib/listingUrl";

type Row = {
  id: string;
  address: string;
  price: string;
  sqft: string;
  beds: string;
  baths: string;
  rent: string;
};

/**
 * Per-row autodetect state for the Address field. Tracks which row
 * is currently looking up + the latest result so we can render a
 * status badge under each Address input independently.
 */
type DetectState = {
  platform: ListingPlatform;
  label: string;
  status: "looking-up" | "filled" | "address-only" | "failed";
  note?: string;
};

/** Pick a numeric or string field from a loosely-typed property data
 *  blob, returning null when not present. Tries multiple naming
 *  variants because upstream listing data sources aren't strict. */
function readBlobNumber(blob: unknown, ...keys: string[]): number | null {
  if (!blob || typeof blob !== "object") return null;
  const obj = blob as Record<string, unknown>;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim()) {
      const n = Number(v.replace(/[$,\s]/g, ""));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function newRow(): Row {
  return {
    id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    address: "",
    price: "",
    sqft: "",
    beds: "3",
    baths: "2",
    rent: "",
  };
}

export default function ComparisonReportBuilderClient({
  planType,
}: {
  planType: string;
}) {
  const { t } = useTranslation("dashboard");
  const [clientName, setClientName] = useState("");
  const [rows, setRows] = useState<Row[]>(() => [newRow(), newRow()]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  /** Autodetect badge state, keyed by row.id. */
  const [detect, setDetect] = useState<Record<string, DetectState | null>>({});

  const isFree = planType.toLowerCase() === "free";

  const updateRow = useCallback((id: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const setRowDetect = useCallback(
    (id: string, value: DetectState | null) => {
      setDetect((prev) => ({ ...prev, [id]: value }));
    },
    [],
  );

  /**
   * Listing-URL autodetect for the Address field. Triggered on paste +
   * blur. When the agent pastes a Zillow / Redfin / Realtor / Compass
   * URL, we hit /api/property/from-listing to extract address + the
   * full property-data blob, then auto-fill the row's empty fields
   * (address, price, sqft, beds, baths). A small badge under the
   * Address input shows what platform was detected.
   *
   * Saves the agent ~5 manual lookups per row in a multi-property
   * compare — the original ask was "better auto detect."
   */
  const detectAddressUrl = useCallback(
    async (rowId: string, rawValue: string) => {
      const value = rawValue.trim();
      if (!value) {
        setRowDetect(rowId, null);
        return;
      }
      const platform = detectPlatform(value);
      if (!platform) {
        // Plain address text or unrecognized URL — no badge, no lookup.
        setRowDetect(rowId, null);
        return;
      }
      const label = platformLabel(platform);
      setRowDetect(rowId, { platform, label, status: "looking-up" });

      try {
        const res = await fetch(
          `/api/property/from-listing?url=${encodeURIComponent(value)}`,
        );
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          address?: string | null;
          data?: unknown;
          error?: string;
        };
        if (!res.ok || !body.ok || !body.address) {
          setRowDetect(rowId, {
            platform,
            label,
            status: "failed",
            note: body.error ?? "Couldn't extract listing details.",
          });
          return;
        }

        // Auto-fill empty fields. Price comes from the listing's sale
        // price; sqft/beds/baths from the structured property data.
        // Never overwrites a value the agent already typed.
        const price = readBlobNumber(body.data, "price", "list_price", "listPrice");
        const sqft = readBlobNumber(body.data, "sqft", "square_feet", "squareFeet");
        const beds = readBlobNumber(body.data, "beds", "bedrooms");
        const baths = readBlobNumber(body.data, "baths", "bathrooms");

        const patch: Partial<Row> = { address: body.address };
        let filledExtras = false;
        setRows((prev) =>
          prev.map((r) => {
            if (r.id !== rowId) return r;
            const next: Row = { ...r };
            // Only auto-fill address if it's empty OR equals the raw
            // pasted URL (i.e. the agent dumped a URL into the field).
            if (!r.address.trim() || r.address.trim() === value) {
              next.address = patch.address ?? r.address;
            }
            if (price != null && !r.price.trim()) {
              next.price = String(price);
              filledExtras = true;
            }
            if (sqft != null && !r.sqft.trim()) {
              next.sqft = String(sqft);
              filledExtras = true;
            }
            // Beds/baths default to "3"/"2" — only auto-fill when
            // the URL gives us something different to learn from.
            if (beds != null) {
              next.beds = String(beds);
              filledExtras = true;
            }
            if (baths != null) {
              next.baths = String(baths);
              filledExtras = true;
            }
            return next;
          }),
        );

        setRowDetect(rowId, {
          platform,
          label,
          status: filledExtras ? "filled" : "address-only",
          note: filledExtras
            ? `Auto-filled from ${label}.`
            : `Address parsed but no listing details available.`,
        });
      } catch (e) {
        setRowDetect(rowId, {
          platform,
          label,
          status: "failed",
          note: e instanceof Error ? e.message : "Network error.",
        });
      }
    },
    [setRowDetect],
  );

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, newRow()]);
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows((prev) => (prev.length <= 2 ? prev : prev.filter((r) => r.id !== id)));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setShareUrl(null);
    if (isFree) {
      setError(t("pages.comparisonReport.upgrade"));
      return;
    }

    const properties = rows.map((r) => ({
      id: r.id,
      address: r.address.trim(),
      price: Number(r.price),
      beds: Number(r.beds),
      baths: Number(r.baths),
      sqft: Number(r.sqft),
      rentMonthly: r.rent.trim() === "" ? null : Number(r.rent),
    }));

    setLoading(true);
    try {
      const res = await fetch("/api/comparison-reports", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: clientName.trim() || "Client",
          properties,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error ?? json.message ?? "Request failed");
      }
      const path = json.share_url as string;
      if (typeof window !== "undefined" && path) {
        setShareUrl(`${window.location.origin}${path}`);
      }
    } catch (err: any) {
      setError(err?.message ?? "Failed to create report");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">{t("pages.comparisonReport.heading")}</h1>
        <p className="mt-2 text-gray-600">{t("pages.comparisonBuilder.intro")}</p>
        {isFree ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {t("pages.comparisonBuilder.requiresBefore")} <strong>Pro</strong> or <strong>Premium</strong>{t("pages.comparisonBuilder.requiresAfter")}{" "}
            <Link href="/agent/pricing" className="font-semibold underline">{t("pages.comparisonBuilder.viewPlans")}</Link>
          </div>
        ) : null}
      </div>

      <form onSubmit={onSubmit} className="space-y-8">
        <div>
          <label className="block text-sm font-medium text-gray-700">{t("pages.comparisonReport.clientName")}</label>
          <input
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            className="mt-1 w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder={t("pages.comparisonReport.clientPlaceholder")}
          />
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">{t("pages.comparisonReport.properties")}</h2>
            <button
              type="button"
              onClick={addRow}
              className="text-sm font-semibold text-[#0066b3] hover:underline"
            >
              + Add property
            </button>
          </div>

          {rows.map((row, idx) => (
            <div key={row.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-800">{t("pages.dashFragments.property")} {idx + 1}</span>
                {rows.length > 2 ? (
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    className="rounded-lg border border-red-200 bg-white px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                  >{t("pages.comparisonBuilder.remove")}</button>
                ) : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="sm:col-span-2 lg:col-span-3">
                  <span className="text-xs text-gray-500">{t("pages.comparisonReport.address")}</span>
                  <input
                    required
                    value={row.address}
                    onChange={(e) => {
                      updateRow(row.id, { address: e.target.value });
                      // Reset the autodetect badge when the agent
                      // edits the field; we'll re-run detection on
                      // blur or next paste.
                      if (detect[row.id]) setRowDetect(row.id, null);
                    }}
                    onBlur={(e) => {
                      void detectAddressUrl(row.id, e.target.value);
                    }}
                    onPaste={(e) => {
                      // Run autodetect immediately on paste — the
                      // most common way agents add a Zillow / Redfin
                      // link to compare. Wait a tick for React to
                      // commit the pasted value.
                      const pasted = e.clipboardData.getData("text") ?? "";
                      if (pasted.trim()) {
                        setTimeout(
                          () => void detectAddressUrl(row.id, pasted.trim()),
                          0,
                        );
                      }
                    }}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder={t("pages.comparisonReport.addressPlaceholder")}
                  />
                  {detect[row.id] && (
                    <span className="mt-1 block text-[11px]">
                      {detect[row.id]!.status === "looking-up" && (
                        <span className="text-gray-500">
                          🔍 {t("pages.listingLookup.detected", { label: detect[row.id]!.label })}
                        </span>
                      )}
                      {detect[row.id]!.status === "filled" && (
                        <span className="text-emerald-700">
                          ✓ {detect[row.id]!.label} detected ·{" "}
                          {detect[row.id]!.note}
                        </span>
                      )}
                      {detect[row.id]!.status === "address-only" && (
                        <span className="text-gray-500">
                          {detect[row.id]!.label} detected ·{" "}
                          {detect[row.id]!.note}
                        </span>
                      )}
                      {detect[row.id]!.status === "failed" && (
                        <span className="text-amber-700">
                          {detect[row.id]!.label} {t("pages.dashFragments.detectedBut")}{" "}
                          {detect[row.id]!.note?.toLowerCase()}
                        </span>
                      )}
                    </span>
                  )}
                </label>
                <label>
                  <span className="text-xs text-gray-500">{t("pages.comparisonReport.price")}</span>
                  <input
                    required
                    type="number"
                    min={1}
                    value={row.price}
                    onChange={(e) => updateRow(row.id, { price: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
                <label>
                  <span className="text-xs text-gray-500">{t("pages.comparisonReport.sqft")}</span>
                  <input
                    required
                    type="number"
                    min={1}
                    value={row.sqft}
                    onChange={(e) => updateRow(row.id, { sqft: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
                <label>
                  <span className="text-xs text-gray-500">{t("pages.comparisonReport.beds")}</span>
                  <input
                    type="number"
                    min={0}
                    value={row.beds}
                    onChange={(e) => updateRow(row.id, { beds: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
                <label>
                  <span className="text-xs text-gray-500">{t("pages.comparisonReport.baths")}</span>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={row.baths}
                    onChange={(e) => updateRow(row.id, { baths: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
                <label>
                  <span className="text-xs text-gray-500">{t("pages.comparisonReport.rent")}</span>
                  <input
                    type="number"
                    min={0}
                    value={row.rent}
                    onChange={(e) => updateRow(row.id, { rent: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
              </div>
            </div>
          ))}
        </div>

        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

        {shareUrl ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <div className="min-w-0">
              <p className="font-semibold">{t("pages.comparisonReport.created")}</p>
              <a href={shareUrl} className="mt-1 block break-all text-[#0066b3] underline" target="_blank" rel="noreferrer">
                {shareUrl}
              </a>
            </div>
            <ShareReport
              shareUrl={shareUrl}
              subject={`Property Comparison Report — ${clientName.trim() || "your options"}`}
              resourceLabel="your property comparison report"
            />
          </div>
        ) : null}

        <button
          type="submit"
          disabled={loading || isFree}
          className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? t("pages.comparisonReport.generating") : t("pages.comparisonReport.generate")}
        </button>
      </form>
    </div>
  );
}
