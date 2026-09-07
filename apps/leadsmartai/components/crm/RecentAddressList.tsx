"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";

/**
 * Recent property addresses associated with a buyer — quick-pick list
 * shared by the new-showing and new-offer forms. Pulls both showings
 * and offers history for the buyer, dedupes by address, and renders
 * as a small vertical list above the address autocomplete so the
 * agent doesn't re-type an address that's already on file.
 *
 * Failures are silent — this is a nice-to-have on top of the regular
 * Google Places autocomplete, never a blocker.
 */

export type RecentAddress = {
  property_address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  source: "showing" | "offer";
  occurredAt: string;
};

type ShowingRow = {
  property_address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  scheduled_at: string;
};

type OfferRow = {
  property_address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  created_at: string;
};

const MAX_ITEMS = 5;

/**
 * Dedupe a combined showings + offers list by case-insensitive
 * address, keeping the most-recent occurrence. The two API responses
 * are already ordered most-recent-first, but we still sort the merged
 * list so showings + offers interleave correctly by date.
 */
function mergeAndDedupe(
  showings: ShowingRow[],
  offers: OfferRow[],
): RecentAddress[] {
  const all: RecentAddress[] = [
    ...showings.map(
      (s): RecentAddress => ({
        property_address: s.property_address,
        city: s.city,
        state: s.state,
        zip: s.zip,
        source: "showing",
        occurredAt: s.scheduled_at,
      }),
    ),
    ...offers.map(
      (o): RecentAddress => ({
        property_address: o.property_address,
        city: o.city,
        state: o.state,
        zip: o.zip,
        source: "offer",
        occurredAt: o.created_at,
      }),
    ),
  ];

  // Most recent first.
  all.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));

  const seen = new Set<string>();
  const out: RecentAddress[] = [];
  for (const row of all) {
    const key = (row.property_address ?? "").trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

/**
 * Calendar-day delta between two timestamps, in the local timezone.
 *
 * The original implementation did `Math.floor(elapsedMs / 24h)` which
 * is wrong for a UI label: a showing scheduled at 2 PM yesterday reads
 * as "today" the next morning because only ~20h have elapsed. Agents
 * read this list at a glance and need yesterday-vs-today to flip
 * exactly at midnight, not at the wall-clock-hour the previous showing
 * was scheduled.
 *
 * Returns negative numbers for future dates (scheduled showings) so the
 * caller can label those distinctly.
 */
type Translate = (k: string, o?: Record<string, unknown>) => string;

function relativeAge(iso: string, t: Translate, locale: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfThen = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime();
  const dayDiff = Math.round((startOfToday - startOfThen) / 86_400_000);

  if (dayDiff < 0) {
    // Future-dated (scheduled showings).
    if (dayDiff === -1) return t("pages.relativeAge.tomorrow");
    if (dayDiff > -7) return t("pages.relativeAge.inDays", { n: -dayDiff });
    return then.toLocaleDateString(locale, { month: "short", day: "numeric" });
  }
  if (dayDiff === 0) return t("pages.relativeAge.today");
  if (dayDiff === 1) return t("pages.relativeAge.yesterday");
  if (dayDiff < 7) return t("pages.relativeAge.daysAgo", { n: dayDiff });
  if (dayDiff < 30) return t("pages.relativeAge.weeksAgo", { n: Math.floor(dayDiff / 7) });
  if (dayDiff < 365) return t("pages.relativeAge.monthsAgo", { n: Math.floor(dayDiff / 30) });
  return t("pages.relativeAge.yearsAgo", { n: Math.floor(dayDiff / 365) });
}

export function RecentAddressList({
  contactId,
  onPick,
}: {
  contactId: string | null;
  onPick: (addr: RecentAddress) => void;
}) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [items, setItems] = useState<RecentAddress[]>([]);

  useEffect(() => {
    if (!contactId) {
      setItems([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [showingsRes, offersRes] = await Promise.all([
          fetch(`/api/dashboard/showings?contactId=${encodeURIComponent(contactId)}`),
          fetch(`/api/dashboard/offers?contactId=${encodeURIComponent(contactId)}`),
        ]);
        const showingsBody = (await showingsRes.json().catch(() => ({}))) as {
          ok?: boolean;
          showings?: ShowingRow[];
        };
        const offersBody = (await offersRes.json().catch(() => ({}))) as {
          ok?: boolean;
          offers?: OfferRow[];
        };
        if (cancelled) return;
        setItems(
          mergeAndDedupe(
            showingsBody.ok ? showingsBody.showings ?? [] : [],
            offersBody.ok ? offersBody.offers ?? [] : [],
          ),
        );
      } catch {
        // Silent — quick-pick is an enhancement, not a hard requirement.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  if (items.length === 0) return null;

  return (
    <div className="mt-1.5 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">{t("pages.misc.recentWithBuyer")}</span>
        <span className="text-[10px] text-slate-400">{items.length}</span>
      </div>
      <ul role="list" className="divide-y divide-slate-100">
        {items.map((item) => (
          <li key={`${item.source}:${item.property_address}`}>
            <button
              type="button"
              onClick={() => onPick(item)}
              className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50"
              title={t("pages.recentAddressList.useAddress", { address: item.property_address })}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-slate-900">
                  {item.property_address}
                </span>
                <span className="mt-0.5 block text-[11px] text-slate-500">
                  {[item.city, item.state, item.zip].filter(Boolean).join(", ") || "—"}
                </span>
              </span>
              <span className="shrink-0 text-right text-[10px] text-slate-500">
                <span
                  className={`block rounded-full px-1.5 py-0.5 font-medium ${
                    item.source === "offer"
                      ? "bg-amber-50 text-amber-800"
                      : "bg-blue-50 text-blue-800"
                  }`}
                >
                  {item.source === "offer" ? t("pages.listingOffersCompare.offer") : t("pages.recentAddressList.showing")}
                </span>
                <span className="mt-0.5 block">{relativeAge(item.occurredAt, t, locale)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
