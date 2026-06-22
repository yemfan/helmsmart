"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import CmaEmailToSellerButton from "@/components/dashboard/CmaEmailToSellerButton";
import {
  buildListingStrategyBands,
  formatBandTag,
} from "@/lib/cma/listingStrategy";
import type { CmaSnapshot } from "@/lib/cma/types";

type CmaFullRow = {
  id: string;
  agentId: string;
  contactId: string | null;
  subjectAddress: string;
  estimatedValue: number | null;
  lowEstimate: number | null;
  highEstimate: number | null;
  confidenceScore: number | null;
  compCount: number;
  title: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  snapshot: CmaSnapshot;
};

function formatMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function isCondo(propertyType: string | null | undefined): boolean {
  return !!propertyType && /condo/i.test(propertyType);
}

/** Lot size for display — blank for condos (no individual lot) or when unknown. */
function formatLot(lotSizeSqft: number | null | undefined, propertyType: string | null | undefined): string {
  if (isCondo(propertyType)) return "—";
  if (lotSizeSqft == null || !Number.isFinite(lotSizeSqft) || lotSizeSqft <= 0) return "—";
  if (lotSizeSqft >= 43560) return `${(lotSizeSqft / 43560).toFixed(2)} ac`;
  return `${Math.round(lotSizeSqft).toLocaleString()} sf`;
}

function formatHoa(hoaMonthly: number | null | undefined): string {
  if (hoaMonthly == null || !Number.isFinite(hoaMonthly) || hoaMonthly <= 0) return "—";
  return `$${Math.round(hoaMonthly).toLocaleString()}/mo`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function CmaDetailClient({ cmaId }: { cmaId: string }) {
  const [cma, setCma] = useState<CmaFullRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/dashboard/cma/${encodeURIComponent(cmaId)}`, {
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          cma?: CmaFullRow;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || data.ok === false || !data.cma) {
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        setCma(data.cma);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cmaId]);

  const bands = useMemo(() => {
    if (!cma) return [];
    return buildListingStrategyBands(cma.snapshot.strategies, cma.snapshot.valuation);
  }, [cma]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-1/3 animate-pulse rounded bg-slate-100" />
        <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    );
  }

  if (error || !cma) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Couldn&apos;t load this CMA: {error ?? "not found"}
        <div className="mt-2">
          <Link href="/dashboard/cma" className="font-semibold text-slate-700 hover:underline">
            ← Back to CMAs
          </Link>
        </div>
      </div>
    );
  }

  const subject = cma.snapshot.subject;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/dashboard/cma"
            className="text-xs font-semibold text-slate-500 hover:text-slate-700"
          >
            ← All CMAs
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            {cma.title || cma.subjectAddress}
          </h1>
          {cma.title ? (
            <p className="text-sm text-slate-600">{cma.subjectAddress}</p>
          ) : null}
          <p className="mt-1 text-xs text-slate-400">
            Saved {formatDate(cma.createdAt)} · {cma.compCount} comp{cma.compCount === 1 ? "" : "s"}
            {cma.confidenceScore != null ? ` · confidence ${cma.confidenceScore}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href={`/api/dashboard/cma/${encodeURIComponent(cma.id)}/pdf`}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            ↓ Download PDF
          </a>
          <CmaEmailToSellerButton cmaId={cma.id} defaultRecipient={null} />
        </div>
      </div>

      {cma.snapshot.disclaimer ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <span className="font-semibold">AI estimate · </span>
          {cma.snapshot.disclaimer}
        </div>
      ) : null}

      {/* Headline value range */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Estimated value</h2>
        <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-slate-200">
          <ValueCell label="Low" value={cma.lowEstimate} tone="text-slate-700" />
          <ValueCell label="Estimated" value={cma.estimatedValue} tone="text-emerald-700" />
          <ValueCell label="High" value={cma.highEstimate} tone="text-slate-700" />
        </div>
        <p className="mt-3 text-[11px] text-slate-500">
          {subject.beds} bed / {subject.baths} bath / {subject.sqft.toLocaleString()} sqft
          {!isCondo(subject.propertyType) && formatLot(subject.lotSizeSqft, subject.propertyType) !== "—"
            ? ` · lot ${formatLot(subject.lotSizeSqft, subject.propertyType)}`
            : ""}
          {formatHoa(subject.hoaMonthly) !== "—" ? ` · HOA ${formatHoa(subject.hoaMonthly)}` : ""}
          {subject.yearBuilt ? ` · built ${subject.yearBuilt}` : ""}
          {subject.condition ? ` · ${subject.condition}` : ""}
        </p>
      </section>

      {/* Listing strategies */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Listing strategies</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Three list-price scenarios with projected days on market.
          </p>
        </header>
        <ul className="divide-y divide-slate-100">
          {bands.map((b) => (
            <li key={b.key} className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-3">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                {formatBandTag(b)}
              </span>
              <p className="text-xs text-slate-600">{b.rationale}</p>
              <span className="text-base font-bold tabular-nums text-slate-900">
                {formatMoney(b.price)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Comps */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">
            Comparable sales ({cma.snapshot.comps.length})
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Sold within ~3 miles of the subject in the last ~12 months.
          </p>
        </header>
        {cma.snapshot.comps.length === 0 ? (
          <div className="px-5 py-6 text-center text-sm text-slate-500">
            No comps available for this property.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Address</th>
                  <th className="px-3 py-2 text-right font-semibold">Beds</th>
                  <th className="px-3 py-2 text-right font-semibold">Baths</th>
                  <th className="px-3 py-2 text-right font-semibold">Sqft</th>
                  <th className="px-3 py-2 text-right font-semibold">Lot</th>
                  <th className="px-3 py-2 text-right font-semibold">HOA</th>
                  <th className="px-3 py-2 text-right font-semibold">$/sqft</th>
                  <th className="px-3 py-2 text-right font-semibold">Sold</th>
                  <th className="px-4 py-2 text-right font-semibold">Price</th>
                  <th className="px-4 py-2 text-right font-semibold">Distance</th>
                </tr>
              </thead>
              <tbody>
                {cma.snapshot.comps.map((c, i) => (
                  <tr key={`${c.address}-${i}`} className="border-t border-slate-100">
                    <td className="px-4 py-2 text-slate-900">
                      <p className="font-semibold">{c.address}</p>
                      {c.propertyType ? (
                        <p className="text-[11px] text-slate-500">{c.propertyType}</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">{c.beds ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">{c.baths ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                      {c.sqft.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                      {formatLot(c.lotSizeSqft, c.propertyType)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                      {formatHoa(c.hoaMonthly)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                      ${Math.round(c.pricePerSqft)}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700">{c.soldDate}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold text-slate-900">
                      {formatMoney(c.price)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                      {c.distanceMiles.toFixed(1)} mi
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {cma.snapshot.summary ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Summary</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-slate-600">
            {cma.snapshot.summary}
          </p>
        </section>
      ) : null}

      {cma.snapshot.sources && cma.snapshot.sources.length > 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">
            Sources ({cma.snapshot.sources.length})
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Where the comps and market data came from — verify before relying on the estimate.
          </p>
          <ul className="mt-3 space-y-1.5">
            {cma.snapshot.sources.map((s, i) => (
              <li key={`${s.url}-${i}`} className="truncate text-sm">
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  {s.title || s.url}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function ValueCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null;
  tone: string;
}) {
  return (
    <div className="bg-white px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tone}`}>
        {value == null
          ? "—"
          : new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 0,
            }).format(value)}
      </p>
    </div>
  );
}
