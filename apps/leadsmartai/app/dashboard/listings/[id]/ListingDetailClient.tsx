"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";
import {
  LISTING_STATUS_LABEL,
  type ListingDetail,
  type ListingStatus,
} from "@/lib/listings/types";
import { ListingAdPanel } from "@/components/listings/ListingAdPanel";
import type {
  ListingOfferCompareItem,
  ListingOfferStatus,
} from "@/lib/listing-offers/types";

const OFFER_STATUS_LABEL: Record<ListingOfferStatus, string> = {
  submitted: "Submitted",
  countered: "Countered",
  accepted: "Accepted",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  expired: "Expired",
};

const OFFER_STATUS_BADGE: Record<ListingOfferStatus, string> = {
  submitted: "bg-blue-100 text-blue-800",
  countered: "bg-amber-100 text-amber-800",
  accepted: "bg-green-100 text-green-800",
  rejected: "bg-rose-100 text-rose-800",
  withdrawn: "bg-slate-100 text-slate-600",
  expired: "bg-slate-100 text-slate-600",
};

const STATUS_BADGE: Record<ListingStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  active: "bg-green-100 text-green-800",
  pending: "bg-amber-100 text-amber-800",
  contracted: "bg-blue-100 text-blue-800",
  withdrawn: "bg-slate-100 text-slate-600",
  expired: "bg-slate-100 text-slate-600",
};

/**
 * Sort spec for the offers table. `field` is the column being
 * sorted on; `dir` is the direction. Column clicks toggle dir on
 * the active field, or switch to a new field with its default
 * direction.
 *
 * The "strength" preset is non-columnar: cash beats financed, ties
 * break on fewest contingencies, then higher price. Surfaced via a
 * separate quick-filter button rather than a column header click.
 */
type SortField =
  | "buyer"
  | "status"
  | "price"
  | "financing"
  | "closing"
  | "contingencies"
  | "earnest"
  | "newest"
  | "strength";

type SortDir = "asc" | "desc";

type OfferSort = { field: SortField; dir: SortDir };

/** Default direction for each column when first clicked. Money +
 *  recency want desc; everything else asc. */
const DEFAULT_DIR: Record<SortField, SortDir> = {
  buyer: "asc",
  status: "asc",
  price: "desc",
  financing: "asc",
  closing: "asc",
  contingencies: "asc",
  earnest: "desc",
  newest: "desc",
  strength: "desc",
};

/**
 * Sort an array of offers per the spec. Null-safe: missing values
 * sort last (treated as +Infinity in asc, -Infinity in desc).
 * `current_price` beats `offer_price` because counters shift it.
 */
function sortedOffers<T extends ListingOfferCompareItem>(
  rows: T[],
  by: OfferSort,
): T[] {
  const next = [...rows];
  const priceOf = (o: T) => o.current_price ?? o.offer_price ?? 0;
  const cmpString = (a: string | null, b: string | null) =>
    (a ?? "￿").localeCompare(b ?? "￿");
  const sign = by.dir === "desc" ? -1 : 1;

  next.sort((a, b) => {
    switch (by.field) {
      case "buyer":
        return cmpString(a.buyer_name, b.buyer_name) * sign;
      case "status":
        return cmpString(a.status, b.status) * sign;
      case "price":
        return (priceOf(a) - priceOf(b)) * sign;
      case "financing":
        // Cash buyers are special — surface them first in asc, last
        // in desc. After that, alpha by financing_type for stability.
        if (a.is_cash !== b.is_cash) {
          return (a.is_cash ? -1 : 1) * sign;
        }
        return cmpString(a.financing_type, b.financing_type) * sign;
      case "closing": {
        const da = a.closing_date_proposed
          ? Date.parse(a.closing_date_proposed)
          : Number.POSITIVE_INFINITY;
        const db = b.closing_date_proposed
          ? Date.parse(b.closing_date_proposed)
          : Number.POSITIVE_INFINITY;
        return (da - db) * sign;
      }
      case "contingencies":
        return (a.contingency_count - b.contingency_count) * sign;
      case "earnest":
        return ((a.earnest_money ?? 0) - (b.earnest_money ?? 0)) * sign;
      case "newest":
        return b.created_at.localeCompare(a.created_at);
      case "strength": {
        // Cash beats financed; ties break on fewest contingencies,
        // then higher price. Ignores dir (always strongest first).
        if (a.is_cash !== b.is_cash) return a.is_cash ? -1 : 1;
        if (a.contingency_count !== b.contingency_count) {
          return a.contingency_count - b.contingency_count;
        }
        return priceOf(b) - priceOf(a);
      }
    }
  });
  return next;
}

function formatMoney(n: number | null | undefined, locale: string): string {
  if (n == null) return "—";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(iso: string | null, locale: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Relative age, as a plain function.
 *
 * It used to call `useTranslation` in its own body — a hook inside something
 * that is not a component, which `rules-of-hooks` reports as an error and
 * which only worked because every caller happened to invoke it during render.
 * The translator is a parameter now, which is what the rest of this codebase
 * does with module-level helpers.
 *
 * Fixing that exposed the second half: the three fallbacks below were English
 * template literals (`${days}d ago`) inside a function whose other branches
 * were translated, so a Chinese listing page read "今天" for one row and
 * "5d ago" for the next.
 */
function formatRelative(
  iso: string | null,
  t: (key: string, opts?: Record<string, unknown>) => string,
  locale: string,
): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const days = Math.round((Date.now() - then) / 86_400_000);
  if (days === 0) return t("pages.listingDetail.today");
  if (days === 1) return t("pages.listingDetail.yesterday");
  if (days < 0) return formatDate(iso, locale);
  if (days < 30) return t("pages.listingDetail.daysAgo", { count: days });
  if (days < 365) {
    return t("pages.listingDetail.monthsAgo", { count: Math.floor(days / 30) });
  }
  return t("pages.listingDetail.yearsAgo", { count: Math.floor(days / 365) });
}

/**
 * Listing detail page. Intentionally focused — surfaces the listing-
 * side essentials (property, status, dates, showings) and links into
 * the back-linked transaction for the post-acceptance lifecycle (escrow,
 * contingencies, closing).
 *
 * Phase 2b of the listings/transactions split. Compared to the legacy
 * /dashboard/transactions/[id] view this page:
 *
 *   - Reads from listings, not transactions
 *   - Uses the 6-state ListingStatus enum directly (no mapping)
 *   - Doesn't render contingency/escrow timelines (those belong to the
 *     contracted-deal view, reachable via the "Open contracted deal"
 *     link below the status badge)
 *
 * Phase 2c will add edit affordances (status changes, list-price
 * updates, etc.). For now this is read-only.
 */
export function ListingDetailClient({
  listing,
  offers: initialOffers,
}: {
  listing: ListingDetail;
  offers: ListingOfferCompareItem[];
}) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const router = useRouter();
  const cityState = [listing.city, listing.state].filter(Boolean).join(", ");
  const fullLocation = [cityState, listing.zip].filter(Boolean).join(" ");

  const [promoting, setPromoting] = useState(false);
  const [promoteError, setPromoteError] = useState<string | null>(null);

  // Add-offer flow was inline here in an earlier iteration but
  // grew too cramped for the field set sellers need to compare
  // offers (contingencies, financing terms, commission, timing,
  // PDF upload). Moved to /dashboard/listings/[id]/offers/new
  // — the "+ Add offer" button on this page is now a Link.

  // Offers list — per-row action state. The list can update
  // optimistically without a full router.refresh() so the agent
  // doesn't see a flicker when accepting / declining / countering.
  // Each action keys its in-flight pending state by `${offerId}:${kind}`
  // so two rows can be acted on independently.
  const [offers, setOffers] = useState<ListingOfferCompareItem[]>(initialOffers);
  /** Sort spec for the offers table. {field, dir} pair so column
   *  headers can toggle direction on the active field, or switch
   *  to a new field with its default direction (see DEFAULT_DIR).
   *  Default: highest price first — what most sellers want when
   *  they open the page. */
  const [sortBy, setSortBy] = useState<OfferSort>({ field: "price", dir: "desc" });

  /**
   * Click a column header → either flip direction on the active
   * field, or switch to the new field with its default direction.
   * "strength" is set via its own button (no column).
   */
  function clickSort(field: SortField) {
    setSortBy((prev) =>
      prev.field === field
        ? { field, dir: prev.dir === "desc" ? "asc" : "desc" }
        : { field, dir: DEFAULT_DIR[field] },
    );
  }
  const [pendingOfferAction, setPendingOfferAction] = useState<string | null>(null);
  const [offerActionError, setOfferActionError] = useState<string | null>(null);
  // Inline counter form — keyed by offerId so only one offer's
  // counter form is open at a time.
  const [counterFormForOfferId, setCounterFormForOfferId] = useState<string | null>(null);
  const [counterPrice, setCounterPrice] = useState("");
  const [counterNotes, setCounterNotes] = useState("");

  async function declineOffer(offerId: string) {
    setPendingOfferAction(`${offerId}:decline`);
    setOfferActionError(null);
    try {
      const res = await fetch(`/api/dashboard/listing-offers/${offerId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "rejected" }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        offer?: { status: ListingOfferStatus };
        error?: string;
      };
      if (!res.ok || !body.ok) {
        setOfferActionError(body.error ?? "Failed to decline offer.");
        return;
      }
      setOffers((prev) =>
        prev.map((o) =>
          o.id === offerId ? { ...o, status: "rejected" as ListingOfferStatus } : o,
        ),
      );
    } catch (e) {
      setOfferActionError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setPendingOfferAction((cur) => (cur === `${offerId}:decline` ? null : cur));
    }
  }

  async function acceptOffer(offerId: string, offerPrice: number) {
    if (
      !confirm(
        `Accept this offer at ${formatMoney(offerPrice, locale)}?\n\nThis marks the offer accepted, flips the listing to "under contract," and opens the new-transaction form prefilled with the listing + offer details.`,
      )
    ) {
      return;
    }
    setPendingOfferAction(`${offerId}:accept`);
    setOfferActionError(null);
    try {
      // 1. PATCH the listing-offer to accepted (stamps accepted_at).
      const acceptRes = await fetch(`/api/dashboard/listing-offers/${offerId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "accepted" }),
      });
      const acceptBody = (await acceptRes.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!acceptRes.ok || !acceptBody.ok) {
        setOfferActionError(acceptBody.error ?? "Failed to accept offer.");
        return;
      }
      // 2. Mark the listing under contract immediately. Doing this
      //    BEFORE the form opens means the listing reflects reality
      //    even if the agent abandons the form mid-create. The
      //    transaction row is created when the form is submitted
      //    (Phase 2d's lifecycle hand-off, but split across two
      //    user actions instead of being auto-fired).
      const listingPatchRes = await fetch(
        `/api/dashboard/listings/${encodeURIComponent(listing.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: "contracted" }),
        },
      );
      const listingPatchBody = (await listingPatchRes.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!listingPatchRes.ok || !listingPatchBody.ok) {
        // Offer is accepted, listing flip failed. Surface the
        // error but optimistically reflect the offer state in UI.
        setOfferActionError(
          listingPatchBody.error ??
            "Offer accepted, but failed to mark the listing under contract.",
        );
        setOffers((prev) =>
          prev.map((o) =>
            o.id === offerId ? { ...o, status: "accepted" as ListingOfferStatus } : o,
          ),
        );
        return;
      }
      // 3. Route to the prefilled new-transaction form. The form
      //    knows how to fetch from listingId + listingOfferId and
      //    seed buyer/address/price/dates/contingencies for the
      //    agent to confirm before the transaction lands.
      router.push(
        `/dashboard/transactions/new?listingId=${encodeURIComponent(listing.id)}&listingOfferId=${encodeURIComponent(offerId)}`,
      );
    } catch (e) {
      setOfferActionError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setPendingOfferAction((cur) => (cur === `${offerId}:accept` ? null : cur));
    }
  }

  async function recordCounter(offerId: string) {
    setOfferActionError(null);
    const priceNum = counterPrice ? Number(counterPrice) : null;
    if (priceNum != null && (!Number.isFinite(priceNum) || priceNum <= 0)) {
      setOfferActionError("Counter price must be a positive number.");
      return;
    }
    setPendingOfferAction(`${offerId}:counter`);
    try {
      const res = await fetch(
        `/api/dashboard/listing-offers/${offerId}/counters`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            // Counter direction: seller_to_buyer is the listing
            // agent countering the buyer's offer (the typical case
            // here since this UI is the listing-side view).
            direction: "seller_to_buyer",
            price: priceNum,
            notes: counterNotes.trim() || null,
          }),
        },
      );
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        setOfferActionError(body.error ?? "Failed to record counter.");
        return;
      }
      // Optimistic: bump the counter_count + flip status to 'countered'.
      setOffers((prev) =>
        prev.map((o) =>
          o.id === offerId
            ? {
                ...o,
                status: "countered" as ListingOfferStatus,
                counter_count: o.counter_count + 1,
                current_price: priceNum ?? o.current_price,
              }
            : o,
        ),
      );
      setCounterFormForOfferId(null);
      setCounterPrice("");
      setCounterNotes("");
    } catch (e) {
      setOfferActionError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setPendingOfferAction((cur) => (cur === `${offerId}:counter` ? null : cur));
    }
  }

  // Promote button visible only on listings that haven't been
  // promoted yet AND aren't in a terminal state. The action moves
  // the listing into "contracted" and spawns a transaction so the
  // post-acceptance lifecycle (escrow, contingencies, closing)
  // gets its own row to track against.
  const canPromote =
    !listing.transactionId &&
    listing.status !== "contracted" &&
    listing.status !== "withdrawn" &&
    listing.status !== "expired";

  async function promote() {
    if (!confirm(
      `Mark this listing under contract?\n\nThis spawns a deal so escrow + closing can be tracked.`,
    )) {
      return;
    }
    setPromoting(true);
    setPromoteError(null);
    try {
      const res = await fetch(
        `/api/dashboard/listings/${encodeURIComponent(listing.id)}/promote`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        transactionId?: string;
        error?: string;
      };
      if (!res.ok || !body.ok || !body.transactionId) {
        setPromoteError(body.error ?? "Failed to promote listing.");
        return;
      }
      // Land on the new transaction so the agent can keep
      // working on the post-acceptance details immediately.
      router.push(`/dashboard/transactions/${body.transactionId}`);
    } catch (e) {
      setPromoteError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setPromoting(false);
    }
  }

  return (
    <main id="main-content" className="mx-auto max-w-5xl space-y-5 px-4 py-8">
      <div>
        <div className="text-xs text-slate-500">
          <Link href="/dashboard/properties" className="hover:underline">{t("pages.listingDetail.listings")}</Link>
          {" / "}
          <span className="truncate">{listing.property_address}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {listing.property_address}
            </h1>
            {fullLocation ? (
              <p className="mt-0.5 text-sm text-slate-500">{fullLocation}</p>
            ) : null}
            {/* Seller name + created relative time live as a
                subtitle here so they don't take up card slots in
                the consolidated 3-card grid below. */}
            <p className="mt-0.5 text-[12px] text-slate-500">
              {listing.contactName ? (
                <>{t("pages.dashFragments.seller")}{" "}
                  <span className="font-medium text-slate-700">
                    {listing.contactName}
                  </span>
                </>
              ) : (
                <span className="text-slate-400">{t("pages.listingDetail.sellerNotSet")}</span>
              )}
              <span className="mx-1.5 text-slate-300">·</span>{t("pages.dashFragments.created")} {formatRelative(listing.created_at, t, locale)}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${STATUS_BADGE[listing.status]}`}
          >
            {LISTING_STATUS_LABEL[listing.status]}
          </span>
        </div>

        {/* Lifecycle area — two states:
            (a) listing already promoted (has a back-linked
                transaction) → blue "Open contracted deal" bridge
                so the agent can jump to the post-acceptance view
            (b) listing not yet promoted but eligible → emerald
                t("pages.listingDetail.markUnderContract") CTA that fires the promote
                endpoint, spawning a transaction to track escrow */}
        {listing.transactionId ? (
          <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
            <Link
              href={`/dashboard/transactions/${listing.transactionId}`}
              className="font-medium hover:underline"
            >
              {t("pages.listingDetail.openContractedDeal")}
            </Link>
            <span className="ml-2 text-[11px] text-blue-700">{t("pages.listingDetail.dealPageNote")}</span>
          </div>
        ) : canPromote ? (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-emerald-900">
                <span className="font-medium">{t("pages.listingDetail.offerAccepted")}</span>
                <span className="ml-2 text-[11px] text-emerald-700">{t("pages.listingDetail.markUnderContract")}</span>
              </div>
              <button
                type="button"
                onClick={() => void promote()}
                disabled={promoting}
                className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {promoting ? t("pages.listingDetail.promoting") : t("pages.listingDetail.markUnderContract")}
              </button>
            </div>
            {promoteError ? (
              <p className="mt-2 text-[11px] text-rose-700">{promoteError}</p>
            ) : null}
          </div>
        ) : null}

        {/* Add-offer affordance + offers list moved to a single
            unified section below the cards grid (the Offers
            section). Keeping the "+ Add offer" button only in
            that section avoids splitting the offers surface into
            two places. */}
      </div>

      {/* ── Key facts: 3 cards ─────────────────────────────────────
          Consolidated from 5 → 3 per agent feedback:
            Property  = address + ZIP + MLS# + LIST PRICE +
                        COMMISSION (price was its own card; folded
                        in since "what + how much" goes together)
            Dates     = Listed + Expires (drop "Created" — moved
                        to the page subtitle since it's less
                        useful for selling decisions)
            Showings  = unchanged
          The standalone Seller card is gone — seller name is now
          a subtitle on the page header. Notes overflow into a
          full-width card below the 3-card row when present. */}
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card title={t("pages.listingDetail.property")}>
          <DetailRow label={t("pages.listingDetail.address")} value={listing.property_address} />
          <DetailRow label={t("pages.listingDetail.cityState")} value={cityState || "—"} />
          <DetailRow label={t("pages.listingDetail.zip")} value={listing.zip ?? "—"} />
          <DetailRow label={t("pages.listingDetail.mls")} value={listing.mls_number ?? "—"} />
          {listing.mls_url ? (
            <DetailRow
              label={t("pages.listingDetail.listingUrl")}
              value={
                <a
                  href={listing.mls_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  {t("pages.listingDetail.openExternal")}
                </a>
              }
            />
          ) : null}
          <DetailRow
            label={t("pages.listingDetail.listPrice")}
            value={
              <span className="font-semibold text-slate-900">
                {formatMoney(listing.list_price, locale)}
              </span>
            }
          />
          <DetailRow
            label={t("pages.listingDetail.commission")}
            value={listing.commission_pct != null ? `${listing.commission_pct}%` : "—"}
          />
        </Card>

        <Card title={t("pages.listingDetail.dates")}>
          <DetailRow label={t("pages.listingDetail.listed")} value={formatDate(listing.listing_start_date, locale)} />
          <DetailRow label={t("pages.listingDetail.expires")} value={formatDate(listing.listing_end_date, locale)} />
        </Card>

        <Card title={t("pages.listingDetail.showings")}>
          <DetailRow label={t("pages.listingDetail.total")} value={String(listing.showings_total)} />
          <DetailRow label={t("pages.listingDetail.upcoming")} value={String(listing.showings_upcoming)} />
          <DetailRow label={t("pages.listingDetail.last")} value={formatRelative(listing.last_showing_at, t, locale)} />
          <div className="pt-1">
            <Link
              href={`/dashboard/showings?propertyAddress=${encodeURIComponent(listing.property_address)}`}
              className="text-xs text-blue-600 hover:underline"
            >
              {t("pages.listingDetail.viewAllShowings")}
            </Link>
          </div>
        </Card>
      </section>

      {listing.notes ? (
        <section>
          <Card title={t("pages.listingDetail.notes")}>
            <p className="whitespace-pre-wrap text-sm text-slate-700">
              {listing.notes}
            </p>
          </Card>
        </section>
      ) : null}

      {/* Listing → video ad: pull photos + facts (Phase 1), then generate a
          cinematic video ad (Phase 2, coming). */}
      <ListingAdPanel listing={listing} />

      {/* Offers received — list with per-row actions. Sits below
          the cards grid because it's the operational surface (the
          cards above are "what's true about this listing"; this is
          "what do I need to act on"). Only renders when there are
          offers in flight; the empty state lives up in the
          Offers received header above to keep this section tight. */}
      {/* Single unified Offers section. Header shows count +
          "+ Add offer" button. When offers exist, render a
          sortable table — column headers click to sort, with an
          arrow indicator on the active column. Counter actions
          open an expansion row inline.
          The "Strongest first" preset button is non-columnar
          (cash beats financed, ties on contingency count, then
          price) since that ranking doesn't map to one column. */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-baseline gap-3">
            <h2 className="text-sm font-semibold text-slate-900">{t("pages.dashFragments.offers")}{offers.length})
            </h2>
            {offers.length > 1 ? (
              <button
                type="button"
                onClick={() => setSortBy({ field: "strength", dir: "desc" })}
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  sortBy.field === "strength"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
                title={t("pages.listingDetail.rankHint")}
              >{t("pages.listingDetail.strongestFirst")}</button>
            ) : null}
            {offerActionError ? (
              <span className="text-[11px] text-rose-700">{offerActionError}</span>
            ) : null}
          </div>
          <Link
            href={`/dashboard/listings/${encodeURIComponent(listing.id)}/offers/new`}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >{t("pages.listingDetail.addOffer")}</Link>
        </div>

        {offers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            {t("pages.listingDetail.noOffersBefore")} <strong>{t("pages.listingDetail.addOffer")}</strong> {t("pages.listingDetail.noOffersAfter")}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-600">
                  <tr>
                    <SortableTh field="buyer" sortBy={sortBy} onClick={clickSort}>{t("pages.listingDetail.buyer")}</SortableTh>
                    <SortableTh field="status" sortBy={sortBy} onClick={clickSort}>{t("pages.listingDetail.status")}</SortableTh>
                    <SortableTh field="price" sortBy={sortBy} onClick={clickSort} align="right">{t("pages.listingDetail.price")}</SortableTh>
                    <SortableTh field="financing" sortBy={sortBy} onClick={clickSort}>{t("pages.listingDetail.financing")}</SortableTh>
                    <SortableTh field="closing" sortBy={sortBy} onClick={clickSort}>{t("pages.listingDetail.closing")}</SortableTh>
                    <SortableTh field="contingencies" sortBy={sortBy} onClick={clickSort} align="center">{t("pages.listingDetail.contingencies")}</SortableTh>
                    <SortableTh field="earnest" sortBy={sortBy} onClick={clickSort} align="right">{t("pages.listingDetail.emd")}</SortableTh>
                    <th className="px-3 py-2 text-right font-medium">{t("pages.listingDetail.actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedOffers(offers, sortBy).map((o) => {
                    const isClosed =
                      o.status === "accepted" ||
                      o.status === "rejected" ||
                      o.status === "withdrawn" ||
                      o.status === "expired";
                    const isAccepting = pendingOfferAction === `${o.id}:accept`;
                    const isDeclining = pendingOfferAction === `${o.id}:decline`;
                    const isCountering = pendingOfferAction === `${o.id}:counter`;
                    const showCounterForm = counterFormForOfferId === o.id;
                    return (
                      <Fragment key={o.id}>
                        <tr className="align-top hover:bg-slate-50">
                          <td className="px-3 py-2.5">
                            <div className="font-medium text-slate-900">
                              {o.buyer_name ?? t("pages.listingDetail.unnamedBuyer")}
                            </div>
                            {o.counter_count > 0 ? (
                              <div className="text-[11px] text-slate-500">
                                {t("pages.listingDetail.counterCount", { count: o.counter_count })}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${OFFER_STATUS_BADGE[o.status]}`}
                            >
                              {OFFER_STATUS_LABEL[o.status]}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            <div className="font-medium text-slate-900">
                              {formatMoney(o.current_price ?? o.offer_price, locale)}
                            </div>
                            {o.current_price != null && o.current_price !== o.offer_price ? (
                              <div className="text-[11px] text-slate-500">
                                {t("pages.listingDetail.fromPrice", { price: formatMoney(o.offer_price, locale) })}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex flex-wrap items-center gap-1">
                              {o.is_cash ? (
                                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">{t("pages.listingDetail.cash")}</span>
                              ) : (
                                <span className="text-slate-700">
                                  {o.financing_type ?? "—"}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-slate-700">
                            {o.closing_date_proposed
                              ? formatDate(o.closing_date_proposed, locale)
                              : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-center tabular-nums">
                            {o.contingency_count === 0 ? (
                              <span className="text-emerald-700">0</span>
                            ) : (
                              <span className="text-slate-700">
                                {o.contingency_count}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                            {formatMoney(o.earnest_money, locale)}
                          </td>
                          <td className="px-3 py-2.5">
                            {!isClosed ? (
                              <div className="flex flex-wrap items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => void acceptOffer(o.id, o.offer_price)}
                                  disabled={isAccepting || isDeclining || isCountering}
                                  className="rounded-lg bg-emerald-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
                                  title={t("pages.listingDetail.acceptHint")}
                                >
                                  {isAccepting ? "…" : t("pages.listingDetail.accept")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCounterFormForOfferId(showCounterForm ? null : o.id);
                                    setCounterPrice(
                                      o.current_price != null
                                        ? String(o.current_price)
                                        : "",
                                    );
                                    setCounterNotes("");
                                    setOfferActionError(null);
                                  }}
                                  disabled={isAccepting || isDeclining}
                                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                  title={t("pages.listingDetail.counterHint")}
                                >
                                  {showCounterForm ? t("pages.listingDetail.cancel") : t("pages.listingDetail.counter")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void declineOffer(o.id)}
                                  disabled={isAccepting || isDeclining || isCountering}
                                  className="rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                                  title={t("pages.listingDetail.declineHint")}
                                >
                                  {isDeclining ? "…" : t("pages.listingDetail.decline")}
                                </button>
                              </div>
                            ) : (
                              <span className="block text-right text-[11px] text-slate-400">
                                —
                              </span>
                            )}
                          </td>
                        </tr>
                        {showCounterForm ? (
                          <tr className="bg-slate-50">
                            <td colSpan={8} className="px-3 py-3">
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs font-medium text-slate-700">{t("pages.listingDetail.counterPrice")}</label>
                                  <input
                                    type="number"
                                    value={counterPrice}
                                    onChange={(e) => setCounterPrice(e.target.value)}
                                    placeholder={String(
                                      o.current_price ?? o.offer_price,
                                    )}
                                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-slate-700">{t("pages.listingDetail.notes")}</label>
                                  <input
                                    value={counterNotes}
                                    onChange={(e) => setCounterNotes(e.target.value)}
                                    placeholder={t("pages.listingDetail.counterPlaceholder")}
                                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                                  />
                                </div>
                              </div>
                              <div className="mt-2 flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setCounterFormForOfferId(null)}
                                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                >{t("pages.listingDetail.cancel")}</button>
                                <button
                                  type="button"
                                  onClick={() => void recordCounter(o.id)}
                                  disabled={isCountering}
                                  className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                                >
                                  {isCountering ? t("pages.listingDetail.recording") : t("pages.listingDetail.recordCounter")}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

/**
 * Sortable <th> for the offers table. Clicking the header toggles
 * direction on the active field, or switches to this field with
 * its default direction. Renders a tiny ▲/▼ chevron on the active
 * column so the agent sees what's currently sorting.
 */
function SortableTh({
  field,
  sortBy,
  onClick,
  align,
  children,
}: {
  field: SortField;
  sortBy: OfferSort;
  onClick: (field: SortField) => void;
  align?: "left" | "right" | "center";
  children: React.ReactNode;
}) {
  const active = sortBy.field === field;
  const alignClass =
    align === "right"
      ? "text-right"
      : align === "center"
        ? "text-center"
        : "text-left";
  return (
    <th className={`${alignClass} px-3 py-2 font-medium`}>
      <button
        type="button"
        onClick={() => onClick(field)}
        className={`inline-flex items-center gap-1 transition-colors ${
          active ? "text-slate-900" : "text-slate-600 hover:text-slate-900"
        }`}
      >
        {children}
        <span className="text-[9px] leading-none" aria-hidden>
          {active ? (sortBy.dir === "desc" ? "▼" : "▲") : "↕"}
        </span>
      </button>
    </th>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <dt className="shrink-0 text-xs font-medium text-slate-500">{label}</dt>
      <dd className="min-w-0 truncate text-right text-slate-900">{value}</dd>
    </div>
  );
}
