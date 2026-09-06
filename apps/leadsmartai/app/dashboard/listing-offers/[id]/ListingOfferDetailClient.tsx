"use client";

import Link from "next/link";
import { useConfirm } from "@/components/ui/useConfirm";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";
import type {
  CounterDirection,
  ListingOfferCounterRow,
  ListingOfferRow,
  ListingOfferStatus,
} from "@/lib/listing-offers/types";

const STATUS_LABEL: Record<ListingOfferStatus, string> = {
  submitted: "Submitted",
  countered: "Countered",
  accepted: "Accepted",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  expired: "Expired",
};

const STATUS_BADGE: Record<ListingOfferStatus, string> = {
  submitted: "bg-blue-100 text-blue-800",
  countered: "bg-amber-100 text-amber-800",
  accepted: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  withdrawn: "bg-slate-100 text-slate-600",
  expired: "bg-slate-100 text-slate-600",
};

function formatMoney(n: number | null | undefined, locale: string): string {
  if (n == null) return "—";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDateTime(iso: string | null, locale: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ListingOfferDetailClient({
  offer: initialOffer,
  counters: initialCounters,
  transaction,
}: {
  offer: ListingOfferRow;
  counters: ListingOfferCounterRow[];
  transaction: { id: string; property_address: string };
}) {
  const { t, i18n } = useTranslation("dashboard");
  const confirmDialog = useConfirm();
  const locale = intlLocale(i18n.language);
  const router = useRouter();
  const [offer, setOffer] = useState(initialOffer);
  const [counters, setCounters] = useState(initialCounters);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  async function saveStatus(next: ListingOfferStatus) {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/dashboard/listing-offers/${offer.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        offer?: ListingOfferRow;
        error?: string;
      };
      if (!res.ok || !body.ok || !body.offer) {
        setMsg({ tone: "err", text: body.error ?? "Failed to save." });
        return;
      }
      setOffer(body.offer);
      setMsg({ tone: "ok", text: t("pages.listingOffer.statusSaved") });
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : "Network error." });
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!await confirmDialog("Delete this offer? This cannot be undone.")) return;
    const res = await fetch(`/api/dashboard/listing-offers/${offer.id}`, { method: "DELETE" });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !body.ok) {
      setMsg({ tone: "err", text: body.error ?? "Failed to delete." });
      return;
    }
    router.push(`/dashboard/transactions/${transaction.id}/offers`);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <div className="text-xs text-slate-500">
          <Link
            href={`/dashboard/transactions/${transaction.id}/offers`}
            className="hover:underline"
          >{t("pages.dashFragments.offersOn")} {transaction.property_address}
          </Link>
          {" / "}
          <span>{offer.buyer_name ?? "(unknown buyer)"}</span>
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">
          {offer.buyer_name ?? t("pages.listingOfferDetail.incomingOffer")}
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
          {offer.buyer_agent_name ? (
            <span>{t("pages.dashFragments.agent")} {offer.buyer_agent_name}
              {offer.buyer_brokerage ? ` · ${offer.buyer_brokerage}` : ""}
            </span>
          ) : null}
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[offer.status]}`}
          >
            {STATUS_LABEL[offer.status]}
          </span>
        </div>
      </div>

      {msg ? (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            msg.tone === "ok"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {msg.text}
        </div>
      ) : null}

      <div className="grid gap-5 md:grid-cols-3">
        <div className="space-y-4 md:col-span-2">
          <Card title={t("pages.listingOffer.offerTerms")}>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Detail label={t("pages.listingOffer.offerPrice")} value={formatMoney(offer.offer_price, locale)} />
              <Detail
                label={t("pages.listingOffer.currentPrice")}
                value={
                  offer.current_price != null && offer.current_price !== offer.offer_price ? (
                    <span className="font-semibold text-slate-900">
                      {formatMoney(offer.current_price, locale)}
                    </span>
                  ) : (
                    formatMoney(offer.current_price ?? offer.offer_price, locale)
                  )
                }
              />
              <Detail label={t("pages.listingOffer.earnestMoney")} value={formatMoney(offer.earnest_money, locale)} />
              <Detail label={t("pages.listingOffer.downPayment")} value={formatMoney(offer.down_payment, locale)} />
              <Detail label={t("pages.listingOffer.financing")} value={offer.financing_type ?? "—"} />
              <Detail label={t("pages.listingOffer.proposedClosing")} value={offer.closing_date_proposed ?? "—"} />
              <Detail label={t("pages.listingOffer.concessions")} value={formatMoney(offer.seller_concessions, locale)} />
              <Detail
                label={t("pages.listingOffer.contingencies")}
                wide
                value={
                  <div className="flex flex-wrap gap-1.5">
                    {offer.inspection_contingency ? <Chip>{t("pages.listingOffer.inspection")}</Chip> : null}
                    {offer.appraisal_contingency ? <Chip>{t("pages.listingOffer.appraisal")}</Chip> : null}
                    {offer.loan_contingency ? <Chip>{t("pages.listingOffer.loan")}</Chip> : null}
                    {offer.sale_of_home_contingency ? <Chip>{t("pages.listingOffer.saleOfHome")}</Chip> : null}
                    {!offer.inspection_contingency &&
                    !offer.appraisal_contingency &&
                    !offer.loan_contingency &&
                    !offer.sale_of_home_contingency ? (
                      <span className="text-xs text-slate-500">{t("pages.listingOffer.noneWaived")}</span>
                    ) : null}
                  </div>
                }
              />
              {offer.contingency_notes ? (
                <Detail label={t("pages.listingOffer.otherContingencies")} value={offer.contingency_notes} wide />
              ) : null}
              {offer.notes ? <Detail label={t("pages.listingOffer.notes")} value={offer.notes} wide /> : null}
            </dl>
          </Card>

          <Card title={t("pages.listingOffer.buyerAgent")}>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Detail label={t("pages.listingOffer.name")} value={offer.buyer_agent_name} />
              <Detail label={t("pages.listingOffer.brokerage")} value={offer.buyer_brokerage} />
              <Detail
                label={t("pages.listingOffer.email")}
                value={
                  offer.buyer_agent_email ? (
                    <a
                      href={`mailto:${offer.buyer_agent_email}`}
                      className="text-blue-600 hover:underline"
                    >
                      {offer.buyer_agent_email}
                    </a>
                  ) : null
                }
              />
              <Detail label={t("pages.listingOffer.phone")} value={offer.buyer_agent_phone} />
            </dl>
          </Card>

          <Card title={t("pages.listingOffer.status")}>
            <div className="flex flex-wrap gap-2">
              {(
                ["submitted", "countered", "accepted", "rejected", "withdrawn", "expired"] as ListingOfferStatus[]
              ).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void saveStatus(s)}
                  disabled={saving || offer.status === s}
                  className={`rounded-lg border px-3 py-1.5 text-sm ${
                    offer.status === s
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  } disabled:opacity-60`}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </Card>

          <CounterTimeline
            offerId={offer.id}
            counters={counters}
            disabled={["accepted", "rejected", "withdrawn", "expired"].includes(offer.status)}
            onCounterAdded={(c) => {
              setCounters((prev) => [...prev, c]);
              void (async () => {
                const res = await fetch(`/api/dashboard/listing-offers/${offer.id}`);
                const body = (await res.json().catch(() => ({}))) as {
                  ok?: boolean;
                  offer?: ListingOfferRow;
                };
                if (body.ok && body.offer) setOffer(body.offer);
              })();
            }}
          />
        </div>

        <div className="space-y-4">
          <Card title={t("pages.listingOffer.quickActions")}>
            <div className="space-y-2">
              <Link
                href={`/dashboard/transactions/${transaction.id}/offers`}
                className="block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                {t("pages.listingOffer.backToCompare")}
              </Link>
              <a
                href={`/api/dashboard/listing-offers/${offer.id}/net-to-seller-pdf`}
                className="block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                {t("pages.listingOffer.downloadNetSheetPdf")}
              </a>
              <button
                type="button"
                onClick={() => void onDelete()}
                className="block w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
              >
                {t("pages.listingOffer.deleteOffer")}
              </button>
            </div>
          </Card>

          <Card title={t("pages.listingOffer.timeline")}>
            <dl className="space-y-2 text-sm">
              <Detail label={t("pages.listingOffer.submitted")} value={formatDateTime(offer.submitted_at, locale)} />
              <Detail label={t("pages.listingOffer.accepted")} value={formatDateTime(offer.accepted_at, locale)} />
              <Detail label={t("pages.listingOffer.closed")} value={formatDateTime(offer.closed_at, locale)} />
              <Detail label={t("pages.listingOffer.expires")} value={formatDateTime(offer.offer_expires_at, locale)} />
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}

function CounterTimeline({
  offerId,
  counters,
  onCounterAdded,
  disabled,
}: {
  offerId: string;
  counters: ListingOfferCounterRow[];
  onCounterAdded: (c: ListingOfferCounterRow) => void;
  disabled: boolean;
}) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [adding, setAdding] = useState(false);
  const [direction, setDirection] = useState<CounterDirection>("seller_to_buyer");
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/dashboard/listing-offers/${offerId}/counters`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          direction,
          price: price ? Number(price) : null,
          notes: notes.trim() || null,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        counter?: ListingOfferCounterRow;
        error?: string;
      };
      if (!res.ok || !body.ok || !body.counter) {
        setErr(body.error ?? "Failed to record counter.");
        return;
      }
      onCounterAdded(body.counter);
      setPrice("");
      setNotes("");
      setAdding(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">{t("pages.listingOffer.counterHistory")}</h2>
        {!adding && !disabled ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            + Add counter
          </button>
        ) : null}
      </div>

      {counters.length === 0 && !adding ? (
        <p className="mt-3 text-sm text-slate-500">
          {disabled ? t("pages.listingOffer.noCountersClosed") : t("pages.listingOffer.noCounters")}
        </p>
      ) : null}

      {counters.length > 0 ? (
        <ol className="mt-3 space-y-2">
          {counters.map((c) => (
            <li key={c.id} className="rounded-lg border border-slate-100 p-3 text-sm">
              <div className="flex items-center justify-between">
                <div className="font-medium text-slate-900">
                  #{c.counter_number} ·{" "}
                  {c.direction === "seller_to_buyer" ? t("pages.listingOffer.sellerToBuyer") : t("pages.listingOffer.buyerToSeller")}
                </div>
                <div className="text-[11px] text-slate-500">{formatDateTime(c.created_at, locale)}</div>
              </div>
              {c.price != null ? (
                <div className="mt-1 tabular-nums text-slate-700">{t("pages.dashFragments.price")} {formatMoney(c.price, locale)}</div>
              ) : null}
              {c.notes ? <div className="mt-1 text-slate-600">{c.notes}</div> : null}
            </li>
          ))}
        </ol>
      ) : null}

      {adding ? (
        <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3">
          <div>
            <label className="block text-xs font-medium text-slate-700">{t("pages.listingOffer.direction")}</label>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as CounterDirection)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="seller_to_buyer">{t("pages.listingOffer.weCountered")}</option>
              <option value="buyer_to_seller">{t("pages.listingOffer.theyCountered")}</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">{t("pages.listingOffer.newPrice")}</label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="1280000"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">{t("detail.offerDetail.notes")}</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("pages.listingOffer.counterNotesPlaceholder")}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </div>
          {err ? <p className="text-xs text-red-600">{err}</p> : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >{t("pages.listingOfferDetail.cancel")}</button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={saving}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? t("pages.listingOffer.saving") : t("pages.listingOffer.recordCounter")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Detail({
  label,
  value,
  wide,
}: {
  label: string;
  value: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <dt className="text-[11px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-slate-800">{value ?? <span className="text-slate-400">—</span>}</dd>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
      {children}
    </span>
  );
}
