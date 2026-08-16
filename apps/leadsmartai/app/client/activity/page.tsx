"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useClientLeadId } from "@/components/client/useClientLeadId";
import { intlLocale } from "@/lib/i18n/locale";

type MeLead = {
  id: string;
  name: string | null;
  property_address: string | null;
  lead_status: string | null;
};

type MeRes = { ok: boolean; leads?: MeLead[]; primaryLeadId?: string | null };

type ShowingItem = {
  id: string;
  propertyAddress: string;
  city: string | null;
  state: string | null;
  scheduledAt: string;
  status: string;
  feedbackRating: number | null;
  feedbackReaction: string | null;
};

type OfferItem = {
  id: string;
  propertyAddress: string;
  offerPrice: number;
  currentPrice: number | null;
  status: string;
  submittedAt: string | null;
  acceptedAt: string | null;
  closedAt: string | null;
};

type ListingSummary = {
  transactionId: string;
  propertyAddress: string;
  listPrice: number | null;
  listingStartDate: string | null;
  daysOnMarket: number | null;
  visitorsTotal: number;
  offersCount: number;
  offersActive: number;
};

type ActivityRes = {
  ok: boolean;
  showings: ShowingItem[];
  offers: OfferItem[];
  listing: ListingSummary | null;
  error?: string;
};

function formatMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
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

const REACTION_EMOJI: Record<string, string> = {
  love: "❤️",
  like: "👍",
  maybe: "🤔",
  pass: "👎",
};

const OFFER_STATUS_COLOR: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  submitted: "bg-blue-100 text-blue-800",
  countered: "bg-amber-100 text-amber-800",
  accepted: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-700",
  withdrawn: "bg-slate-100 text-slate-600",
  expired: "bg-slate-100 text-slate-600",
};

export default function ClientActivityPage() {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [me, setMe] = useState<MeRes | null>(null);
  const [activity, setActivity] = useState<ActivityRes | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const leads = me?.leads ?? [];
  const validLeadIds = leads.length ? leads.map((l) => l.id) : null;
  const { leadId, setLeadId } = useClientLeadId(me?.primaryLeadId ?? null, validLeadIds);

  const loadMe = useCallback(async () => {
    const r = await fetch("/api/client/me", { credentials: "include" });
    const j = (await r.json()) as MeRes;
    setMe(j);
  }, []);

  const loadActivity = useCallback(async () => {
    if (!leadId) {
      setActivity(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/client/activity?leadId=${encodeURIComponent(leadId)}`, {
        credentials: "include",
      });
      const j = (await r.json().catch(() => null)) as ActivityRes | null;
      if (!r.ok || !j || !j.ok) {
        setErr(j?.error ?? "Could not load activity.");
        setActivity(null);
        return;
      }
      setActivity(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error.");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);
  useEffect(() => {
    void loadActivity();
  }, [loadActivity]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{t("pages.clientPortal.activity")}</h1>
        <p className="mt-0.5 text-xs text-slate-500">{t("pages.clientPortal.activitySub")}</p>
      </div>

      {leads.length > 1 ? (
        <select
          value={leadId ?? ""}
          onChange={(e) => setLeadId(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          {leads.map((l) => (
            <option key={l.id} value={l.id}>
              {l.property_address ?? l.name ?? l.id}
            </option>
          ))}
        </select>
      ) : null}

      {loading ? (
        <div className="py-10 text-center text-sm text-slate-400">Loading…</div>
      ) : err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      ) : !activity ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">{t("pages.clientPortal.noActivity")}</div>
      ) : (
        <>
          {activity.listing ? <ListingCard listing={activity.listing} /> : null}
          <ShowingsCard items={activity.showings} />
          <OffersCard items={activity.offers} />

          {!activity.listing &&
          activity.showings.length === 0 &&
          activity.offers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">{t("pages.clientPortal.noActivityHint")}</div>
          ) : null}
        </>
      )}

      {/* The existing /client/assistant page is still reachable via URL;
          we dropped it from the bottom nav to make room for Activity. */}
      <Link
        href="/client/assistant"
        className="block rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-xs text-slate-500 hover:bg-slate-50"
      >
        Ask the AI assistant →
      </Link>
    </div>
  );
}

function ListingCard({ listing }: { listing: ListingSummary }) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">{t("pages.clientPortal.yourListing")}</div>
      <div className="mt-1 text-base font-semibold text-slate-900">
        {listing.propertyAddress}
      </div>
      <div className="mt-1 text-xs text-slate-500">
        {listing.listPrice ? formatMoney(listing.listPrice) : "Price TBD"}
        {listing.daysOnMarket != null
          ? ` · ${listing.daysOnMarket} day${listing.daysOnMarket === 1 ? "" : "s"} on market`
          : ""}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat label={t("pages.clientPortal.visitors")} value={listing.visitorsTotal} />
        <Stat label={t("pages.clientPortal.totalOffers")} value={listing.offersCount} />
        <Stat label={t("pages.clientPortal.active")} value={listing.offersActive} tone="blue" />
      </div>
      <p className="mt-3 text-[11px] text-slate-400">{t("pages.clientPortal.weeklySummary")}</p>
    </div>
  );
}

function ShowingsCard({ items }: { items: ShowingItem[] }) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  if (items.length === 0) return null;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">{t("pages.dashFragments.showings")}{items.length})
      </h2>
      <ul className="mt-2 space-y-2">
        {items.map((s) => (
          <li key={s.id} className="rounded-xl border border-slate-100 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium text-slate-900">{s.propertyAddress}</div>
                <div className="text-[11px] text-slate-500">
                  {formatDate(s.scheduledAt, locale)}
                  {s.city || s.state
                    ? ` · ${[s.city, s.state].filter(Boolean).join(", ")}`
                    : ""}
                </div>
              </div>
              <div className="shrink-0 text-right">
                {s.feedbackReaction ? (
                  <div className="text-xl leading-none">
                    {REACTION_EMOJI[s.feedbackReaction] ?? "—"}
                  </div>
                ) : null}
                {s.feedbackRating ? (
                  <div className="mt-0.5 text-[10px] text-slate-500">
                    {s.feedbackRating}/5
                  </div>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OffersCard({ items }: { items: OfferItem[] }) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  if (items.length === 0) return null;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">{t("pages.dashFragments.offers")}{items.length})
      </h2>
      <ul className="mt-2 space-y-2">
        {items.map((o) => (
          <li key={o.id} className="rounded-xl border border-slate-100 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium text-slate-900">{o.propertyAddress}</div>
                <div className="mt-0.5 text-[11px] text-slate-500">{t("pages.dashFragments.submitted")} {formatDate(o.submittedAt, locale)}
                  {o.acceptedAt ? ` · Accepted ${formatDate(o.acceptedAt, locale)}` : ""}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="tabular-nums font-semibold text-slate-900">
                  {formatMoney(o.currentPrice ?? o.offerPrice)}
                </div>
                <span
                  className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
                    OFFER_STATUS_COLOR[o.status] ?? "bg-slate-100 text-slate-700"
                  }`}
                >
                  {o.status}
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "blue";
}) {
  const color = tone === "blue" ? "text-blue-700" : "text-slate-900";
  return (
    <div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-[10px] text-slate-500">{label}</div>
    </div>
  );
}
