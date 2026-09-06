"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";

import CmaEmailToSellerButton from "@/components/dashboard/CmaEmailToSellerButton";
import ShareReport from "@/components/share/ShareReport";
import {
  buildListingStrategyBands,
  formatBandTag,
} from "@/lib/cma/listingStrategy";
import { isCredibleCmaValuation } from "@/lib/cma/types";
import type { CmaSnapshot } from "@/lib/cma/types";
import { cmaBasis, confidenceBand } from "@/lib/cma/confidence";

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

function formatMoney(n: number | null | undefined, locale: string): string {
  if (n == null) return "—";
  return new Intl.NumberFormat(locale, {
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

function formatDate(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleDateString(locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function CmaDetailClient({ cmaId }: { cmaId: string }) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [cma, setCma] = useState<CmaFullRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  useEffect(() => {
    setShareUrl(`${window.location.origin}/cma/${encodeURIComponent(cmaId)}`);
  }, [cmaId]);

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
        <div className="h-8 w-1/3 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        <div className="h-32 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
        <div className="h-64 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
      </div>
    );
  }

  if (error || !cma) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {t("pages.cmaDetail.couldntLoad", { reason: error ?? t("pages.cmaDetail.notFound") })}
        <div className="mt-2">
          <Link href="/dashboard/cma" className="font-semibold text-slate-700 dark:text-slate-300 hover:underline">
            {t("pages.cmaDetail.backToCmas")}
          </Link>
        </div>
      </div>
    );
  }

  const subject = cma.snapshot.subject;
  // Older saved CMAs (created before the generation guard) can carry a failed
  // $0 valuation. Never expose Share / Email-to-seller / PDF on those — a $0
  // value reaching a seller's inbox is a credibility killer.
  const valuationOk = isCredibleCmaValuation(cma.snapshot.valuation);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/dashboard/cma"
            className="text-xs font-semibold text-slate-500 hover:text-slate-700"
          >
            {t("pages.cmaDetail.backToAll")}
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {cma.title || cma.subjectAddress}
          </h1>
          {cma.title ? (
            <p className="text-sm text-slate-600 dark:text-slate-400">{cma.subjectAddress}</p>
          ) : null}
          <p className="mt-1 text-xs text-slate-400">
            {t("pages.cmaDetail.savedLine", {
              date: formatDate(cma.createdAt, locale),
              count: cma.compCount,
            })}
          </p>
        </div>
        {valuationOk ? (
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={`/api/dashboard/cma/${encodeURIComponent(cma.id)}/report`}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800"
            >
              {t("pages.cmaDetail.generateReport")}
            </a>
            <ShareReport
              shareUrl={shareUrl}
              downloadHref={`/api/dashboard/cma/${encodeURIComponent(cma.id)}/pdf`}
              subject={t("pages.cmaDetail.emailSubject", {
                address: cma.subjectAddress,
              })}
              resourceLabel={t("pages.cmaDetail.resourceLabel", {
                address: cma.subjectAddress,
              })}
            />
            <CmaEmailToSellerButton cmaId={cma.id} defaultRecipient={null} />
          </div>
        ) : (
          <Link
            href="/dashboard/cma"
            className="shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            {t("pages.cmaDetail.regenerate")}
          </Link>
        )}
      </div>

      {!valuationOk ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <span className="font-semibold">{t("pages.cmaDetail.unavailable")}</span>{t("pages.cmaDetail.unreliable")}</div>
      ) : null}

      {cma.snapshot.disclaimer ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <span className="font-semibold">{t("pages.cmaDetail.aiEstimate")}</span>
          {t("disclaimers.aiCma")}
        </div>
      ) : null}

      {/* Headline value range */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("pages.cmaDetail.estimatedValue")}</h2>
        <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-slate-200">
          <ValueCell label={t("pages.cmaDetail.low")} value={cma.lowEstimate} tone="text-slate-700" />
          <ValueCell label={t("pages.cmaDetail.estimated")} value={cma.estimatedValue} tone="text-emerald-700" />
          <ValueCell label={t("pages.cmaDetail.high")} value={cma.highEstimate} tone="text-slate-700" />
        </div>
        {/* Why to trust the number: band, comps, distance, recency, ± range. */}
        {(() => {
            const band = confidenceBand(cma.confidenceScore);
            const basis = cmaBasis(cma.snapshot.valuation, cma.snapshot.comps);
            const tone =
              band === "high" ? "text-emerald-700" : band === "medium" ? "text-amber-700" : band === "low" ? "text-rose-700" : "text-slate-500";
            const recency =
              basis.newestSoldMonthsAgo == null
                ? null
                : basis.newestSoldMonthsAgo === 0
                  ? t("pages.cmaConfidence.recencyThisMonth")
                  : t("pages.cmaConfidence.recencyMonths", { count: basis.newestSoldMonthsAgo });
            return (
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                <span className={`font-semibold ${tone}`}>
                  {band ? t(`pages.cmaConfidence.${band}`, { score: cma.confidenceScore }) : t("pages.cmaConfidence.unknown")}
                </span>
                {" · "}
                {basis.compCount === 0
                  ? t("pages.cmaConfidence.basisNoComps")
                  : t("pages.cmaConfidence.basis", {
                      count: basis.compCount,
                      miles: basis.maxDistanceMiles ?? "—",
                      recency: recency ?? t("pages.cmaConfidence.recencyUnknown"),
                      spread: basis.spreadPct ?? "—",
                    })}
              </p>
            );
          })()}
        <p className="mt-3 text-[11px] text-slate-500">
          {t("pages.cmaDetail.subjectLine", {
            beds: subject.beds,
            baths: subject.baths,
            sqft: subject.sqft.toLocaleString(),
          })}
          {subject.propertyType ? ` · ${subject.propertyType}` : ""}
          {!isCondo(subject.propertyType) && formatLot(subject.lotSizeSqft, subject.propertyType) !== "—"
            ? t("pages.cmaDetail.lotSuffix", {
                lot: formatLot(subject.lotSizeSqft, subject.propertyType),
              })
            : ""}
          {formatHoa(subject.hoaMonthly) !== "—"
            ? t("pages.cmaDetail.hoaSuffix", { hoa: formatHoa(subject.hoaMonthly) })
            : ""}
          {subject.yearBuilt
            ? t("pages.cmaDetail.builtSuffix", { year: subject.yearBuilt })
            : ""}
          {subject.condition ? ` · ${subject.condition}` : ""}
        </p>
      </section>

      {/* Listing strategies */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
        <header className="border-b border-slate-100 dark:border-slate-700 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("pages.cmaDetail.strategies")}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{t("pages.cmaDetail.scenarios")}</p>
        </header>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {bands.map((b) => (
            <li key={b.key} className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-3">
              <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                {formatBandTag(b)}
              </span>
              <p className="text-xs text-slate-600 dark:text-slate-400">{b.rationale}</p>
              <span className="text-base font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {formatMoney(b.price, locale)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Comps */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
        <header className="border-b border-slate-100 dark:border-slate-700 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t("pages.cmaDetail.comparableSales", { count: cma.snapshot.comps.length })}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Sold within ~3 miles of the subject in the last ~12 months.
          </p>
        </header>
        {cma.snapshot.comps.length === 0 ? (
          <div className="px-5 py-6 text-center text-sm text-slate-500">{t("pages.cmaDetail.noComps")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">{t("pages.cmaDetail.colAddress")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("pages.cmaDetail.colBeds")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("pages.cmaDetail.colBaths")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("pages.cmaDetail.colSqft")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("pages.cmaDetail.colLot")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("pages.cmaDetail.colHoa")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("pages.cmaDetail.colPerSqft")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("pages.cmaDetail.colSold")}</th>
                  <th className="px-4 py-2 text-right font-semibold">{t("pages.cmaDetail.colPrice")}</th>
                  <th className="px-4 py-2 text-right font-semibold">{t("pages.cmaDetail.colDistance")}</th>
                </tr>
              </thead>
              <tbody>
                {cma.snapshot.comps.map((c, i) => (
                  <tr key={`${c.address}-${i}`} className="border-t border-slate-100 dark:border-slate-700">
                    <td className="px-4 py-2 text-slate-900 dark:text-slate-100">
                      <p className="font-semibold">{c.address}</p>
                      {c.propertyType ? (
                        <p className="text-[11px] text-slate-500">{c.propertyType}</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">{c.beds ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">{c.baths ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">
                      {c.sqft.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">
                      {formatLot(c.lotSizeSqft, c.propertyType)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">
                      {formatHoa(c.hoaMonthly)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">
                      ${Math.round(c.pricePerSqft)}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-300">{c.soldDate}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                      {formatMoney(c.price, locale)}
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
        <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("pages.cmaDetail.summary")}</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-slate-600 dark:text-slate-400">
            {cma.snapshot.summary}
          </p>
        </section>
      ) : null}

      {cma.snapshot.sources && cma.snapshot.sources.length > 0 ? (
        <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t("pages.cmaDetail.sourcesN", { count: cma.snapshot.sources.length })}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">{t("pages.cmaDetail.sources")}</p>
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
  const { i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  return (
    <div className="bg-white dark:bg-slate-900 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tone}`}>
        {value == null
          ? "—"
          : new Intl.NumberFormat(locale, {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 0,
            }).format(value)}
      </p>
    </div>
  );
}
