"use client";

import Link from "next/link";
import { useConfirm } from "@/components/ui/useConfirm";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DEFAULT_NET_TO_SELLER_ASSUMPTIONS,
  computeNetToSeller,
  rankOffers,
} from "@/lib/listing-offers/netToSeller";
import type { ListingOfferCompareItem, ListingOfferStatus } from "@/lib/listing-offers/types";
import type { OfferCompareSummary } from "@/lib/listing-offers/compareSummary";

type TransactionSummary = {
  id: string;
  property_address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  purchase_price: number | null;
  transaction_type: "buyer_rep" | "listing_rep" | "dual";
};

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

function formatMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function ListingOffersCompareClient({
  transaction,
  initialOffers,
}: {
  transaction: TransactionSummary;
  initialOffers: ListingOfferCompareItem[];
}) {
  const { t } = useTranslation("dashboard");
  const confirmDialog = useConfirm();
  const [offers, setOffers] = useState(initialOffers);
  const [showAdd, setShowAdd] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  // AI summary + recommendation over the offers (reads the net-to-seller numbers).
  const [summary, setSummary] = useState<OfferCompareSummary | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [summaryErr, setSummaryErr] = useState<string | null>(null);

  // Net-to-seller assumptions — agent can tune them for this listing.
  const [commissionPct, setCommissionPct] = useState(
    String(DEFAULT_NET_TO_SELLER_ASSUMPTIONS.commissionPct),
  );
  const [titleEscrowPct, setTitleEscrowPct] = useState(
    String(DEFAULT_NET_TO_SELLER_ASSUMPTIONS.titleEscrowPct),
  );
  const [transferTaxPct, setTransferTaxPct] = useState(
    String(DEFAULT_NET_TO_SELLER_ASSUMPTIONS.transferTaxPct),
  );
  const [otherCostsFlat, setOtherCostsFlat] = useState("0");

  const assumptionsValid = useMemo(() => {
    return [commissionPct, titleEscrowPct, transferTaxPct, otherCostsFlat].every((v) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0;
    });
  }, [commissionPct, titleEscrowPct, transferTaxPct, otherCostsFlat]);

  const enriched = useMemo(() => {
    const assumptions = {
      commissionPct: Number(commissionPct) || 0,
      titleEscrowPct: Number(titleEscrowPct) || 0,
      transferTaxPct: Number(transferTaxPct) || 0,
      otherCostsFlat: Number(otherCostsFlat) || 0,
    };
    return offers.map((o) => {
      const price = o.current_price ?? o.offer_price;
      const breakdown = computeNetToSeller({
        price,
        ...assumptions,
        sellerConcessions: o.seller_concessions ?? 0,
      });
      return { ...o, price, net: breakdown.net, breakdown };
    });
  }, [offers, commissionPct, titleEscrowPct, transferTaxPct, otherCostsFlat]);

  const ranked = useMemo(
    () =>
      rankOffers(
        enriched.map((o) => ({
          ...o,
          contingencyCount: o.contingency_count,
          isCash: o.is_cash,
        })),
      ),
    [enriched],
  );

  const strongestNetId = ranked[0]?.id ?? null;
  const highestStickerId = [...enriched]
    .sort((a, b) => b.price - a.price)[0]?.id ?? null;

  async function reloadOffers() {
    try {
      const res = await fetch(
        `/api/dashboard/transactions/${transaction.id}/listing-offers`,
      );
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        offers?: ListingOfferCompareItem[];
      } | null;
      if (body?.ok && Array.isArray(body.offers)) setOffers(body.offers);
    } catch {
      /* non-fatal */
    }
  }

  async function updateStatus(
    offerId: string,
    status: ListingOfferStatus,
    extra?: { rejectSiblingsOnAccept?: boolean },
  ) {
    setMsg(null);
    try {
      const res = await fetch(`/api/dashboard/listing-offers/${offerId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, ...extra }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        siblingsRejected?: number;
      };
      if (!res.ok || !body.ok) {
        setMsg({ tone: "err", text: body.error ?? "Failed to update." });
        return;
      }
      await reloadOffers();
      const rejected = body.siblingsRejected ?? 0;
      setMsg({
        tone: "ok",
        text:
          rejected > 0
            ? `Accepted. ${rejected} sibling offer${rejected === 1 ? "" : "s"} auto-rejected.`
            : "Updated.",
      });
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : "Network error." });
    }
  }

  /**
   * Accept-with-confirmation flow: when there are still-live sibling
   * offers, ask the agent whether to auto-reject them. Keeping
   * siblings is a legitimate choice (backup offers in case the
   * primary falls through during contingencies), so default to the
   * agent's explicit choice rather than reject-all.
   */
  async function acceptWithConfirmation(offerId: string) {
    const liveSiblings = offers.filter(
      (o) => o.id !== offerId && ["submitted", "countered"].includes(o.status),
    );
    if (liveSiblings.length === 0) {
      await updateStatus(offerId, "accepted");
      return;
    }
    const msg = [
      `${liveSiblings.length} other offer${liveSiblings.length === 1 ? "" : "s"} still live.`,
      "",
      "Click OK to ALSO mark them as rejected now.",
      "Click Cancel to keep them as backup (status stays 'submitted' / 'countered').",
    ].join("\n");
    const rejectSiblings = await confirmDialog(msg);
    await updateStatus(offerId, "accepted", {
      rejectSiblingsOnAccept: rejectSiblings,
    });
  }

  async function summarize() {
    setSummarizing(true);
    setSummaryErr(null);
    try {
      const payload = {
        listPrice: transaction.purchase_price,
        offers: enriched.map((o) => ({
          id: o.id,
          buyerName: o.buyer_name ?? null,
          price: o.price,
          net: o.net,
          financing: o.financing_type ?? null,
          isCash: o.is_cash,
          contingencyCount: o.contingency_count,
          sellerConcessions: o.seller_concessions ?? null,
          closeDate: o.closing_date_proposed ?? null,
          status: o.status,
        })),
      };
      const res = await fetch("/api/dashboard/listing-offers/summary", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        summary?: OfferCompareSummary;
      };
      if (!res.ok || !body.ok || !body.summary) {
        throw new Error(body.error ?? "Could not generate the summary.");
      }
      setSummary(body.summary);
    } catch (e) {
      setSummaryErr(e instanceof Error ? e.message : "Could not generate the summary.");
    } finally {
      setSummarizing(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <div className="text-xs text-slate-500">
          <Link href="/dashboard/transactions" className="hover:underline">{t("pages.offersCompare.transactions")}</Link>
          {" / "}
          <Link
            href={`/dashboard/transactions/${transaction.id}`}
            className="hover:underline"
          >
            {transaction.property_address}
          </Link>
          {" / Offers"}
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{t("pages.offersCompare.heading")}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {transaction.property_address}
          {transaction.city || transaction.state
            ? `, ${[transaction.city, transaction.state].filter(Boolean).join(", ")}`
            : ""}
          {transaction.purchase_price
            ? ` · list price ${formatMoney(transaction.purchase_price)}`
            : ""}
        </p>
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

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">{t("pages.offersCompare.assumptions")}</h2>
        <p className="mt-0.5 text-xs text-slate-500">{t("pages.offersCompare.adjustNote")}</p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <AssumptionInput
            label={t("pages.offersCompare.commissionPct")}
            value={commissionPct}
            onChange={setCommissionPct}
            suffix="%"
          />
          <AssumptionInput
            label={t("pages.offersCompare.titleEscrowPct")}
            value={titleEscrowPct}
            onChange={setTitleEscrowPct}
            suffix="%"
          />
          <AssumptionInput
            label={t("pages.offersCompare.transferTaxPct")}
            value={transferTaxPct}
            onChange={setTransferTaxPct}
            suffix="%"
          />
          <AssumptionInput
            label={t("pages.offersCompare.otherFlat")}
            value={otherCostsFlat}
            onChange={setOtherCostsFlat}
            suffix="$"
          />
        </div>
        {!assumptionsValid ? (
          <p className="mt-2 text-xs text-red-600">{t("pages.offersCompare.nonNegative")}</p>
        ) : null}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">
          {offers.length} {offers.length === 1 ? "offer" : "offers"}
          {strongestNetId ? " · strongest net highlighted in green" : ""}
        </h2>
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          {showAdd ? t("pages.offersCompare.cancel") : t("pages.offersCompare.recordOffer")}
        </button>
      </div>

      {showAdd ? (
        <NewListingOfferForm
          transactionId={transaction.id}
          onCreated={() => {
            setShowAdd(false);
            void reloadOffers();
          }}
          onCancel={() => setShowAdd(false)}
        />
      ) : null}

      {offers.length === 0 && !showAdd ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
          {t("pages.offersCompare.noOffersBefore")} <strong>+ Record offer</strong>{t("pages.offersCompare.noOffersAfter")}
        </div>
      ) : null}

      {offers.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">{t("pages.offersCompare.colBuyerAgent")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("pages.offersCompare.colPrice")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("pages.offersCompare.colNet")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("pages.offersCompare.financing")}</th>
                  <th className="px-3 py-2 text-center font-medium">{t("pages.offersCompare.colContingencies")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("pages.offersCompare.colConcessions")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("pages.offersCompare.colClose")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("pages.offersCompare.colStatus")}</th>
                  <th className="px-3 py-2 text-center font-medium">{t("pages.offersCompare.colActions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {enriched.map((o) => {
                  const isStrongestNet = o.id === strongestNetId && offers.length > 1;
                  const isHighestSticker =
                    o.id === highestStickerId && o.id !== strongestNetId && offers.length > 1;
                  return (
                    <tr
                      key={o.id}
                      className={
                        isStrongestNet
                          ? "bg-green-50 hover:bg-green-100"
                          : "hover:bg-slate-50"
                      }
                    >
                      <td className="px-3 py-2">
                        <Link
                          href={`/dashboard/listing-offers/${o.id}`}
                          className="font-medium text-slate-900 hover:underline"
                        >
                          {o.buyer_name ?? "(unknown)"}
                        </Link>
                        {o.buyer_agent_name ? (
                          <div className="text-[11px] text-slate-500">
                            {t("pages.offersCompare.viaAgent", { name: o.buyer_agent_name })}
                            {o.buyer_brokerage ? ` · ${o.buyer_brokerage}` : ""}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <div
                          className={`font-medium ${
                            isHighestSticker ? "text-blue-700" : "text-slate-900"
                          }`}
                        >
                          {formatMoney(o.price)}
                        </div>
                        {o.current_price != null && o.current_price !== o.offer_price ? (
                          <div className="text-[11px] text-slate-400 line-through">
                            {formatMoney(o.offer_price)}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <div
                          className={`font-semibold ${
                            isStrongestNet ? "text-green-700" : "text-slate-900"
                          }`}
                        >
                          {formatMoney(o.net)}
                        </div>
                        {isStrongestNet ? (
                          <div className="text-[10px] font-medium uppercase tracking-wide text-green-700">{t("pages.offersCompare.strongestNet")}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {o.financing_type ? (
                          <span className="capitalize">{o.financing_type}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                        {o.is_cash ? (
                          <div className="text-[10px] font-medium uppercase tracking-wide text-green-700">{t("pages.offersCompare.cash")}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            o.contingency_count === 0
                              ? "bg-green-100 text-green-800"
                              : o.contingency_count <= 2
                                ? "bg-slate-100 text-slate-700"
                                : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {o.contingency_count}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                        {o.seller_concessions ? (
                          <span className="text-red-600">
                            {formatMoney(o.seller_concessions)}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[11px] text-slate-500">
                        {o.closing_date_proposed ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[o.status]}`}
                        >
                          {STATUS_LABEL[o.status]}
                        </span>
                        {o.counter_count > 0 ? (
                          <div className="text-[10px] text-slate-500">
                            {t("pages.offersCompare.counterCount", { count: o.counter_count })}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {o.status === "submitted" || o.status === "countered" ? (
                          <button
                            type="button"
                            onClick={() => void acceptWithConfirmation(o.id)}
                            className="rounded-lg bg-green-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-green-700"
                          >{t("pages.offersCompare.accept")}</button>
                        ) : (
                          <Link
                            href={`/dashboard/listing-offers/${o.id}`}
                            className="text-[11px] text-blue-600 hover:underline"
                          >{t("pages.offersCompare.view")}</Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {offers.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-900">{t("pages.offersCompare.aiSummary")}</h2>
            <button
              type="button"
              onClick={() => void summarize()}
              disabled={summarizing}
              className="rounded-lg bg-[#0072ce] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#005fa8] disabled:opacity-50"
            >
              {summarizing ? t("common:status.analyzing") : summary ? t("pages.offersCompare.refresh") : t("pages.offersCompare.summarize")}
            </button>
          </div>
          {summaryErr ? <p className="mt-2 text-xs text-red-600">{summaryErr}</p> : null}
          {summary ? (
            <div className="mt-3 space-y-3">
              <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                {summary.recommendation.headline ? (
                  <p className="text-sm font-semibold text-green-900">{summary.recommendation.headline}</p>
                ) : null}
                {summary.recommendation.rationale ? (
                  <p className="mt-1 text-sm text-slate-700">{summary.recommendation.rationale}</p>
                ) : null}
                {summary.recommendation.watchOuts.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-slate-600">
                    {summary.recommendation.watchOuts.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
              {summary.perOffer.length > 0 ? (
                <div className="space-y-1.5">
                  {summary.perOffer.map((p) => {
                    const o = enriched.find((x) => x.id === p.offerId);
                    return (
                      <div key={p.offerId} className="flex gap-2 text-xs">
                        <span className="shrink-0 font-medium text-slate-900">
                          {o?.buyer_name ?? t("pages.listingOffersCompare.offer")}:
                        </span>
                        <span className="text-slate-600">{p.summary}</span>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {summary.sellerNote ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t("pages.offersCompare.sellerNote")}</p>
                  <p className="mt-1 text-sm text-slate-700">{summary.sellerNote}</p>
                </div>
              ) : null}
              <p className="text-[10px] italic text-slate-400">{t("disclaimers.offerCompare")}</p>
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-500">{t("pages.offersCompare.aiReadNote")}</p>
          )}
        </div>
      ) : null}

      {offers.length > 1 ? (
        <p className="text-[11px] text-slate-500">
          Strongest net ≠ highest price. The green row is the offer that would put the most cash
          in the seller&apos;s pocket after commission, title/escrow, transfer tax, and any
          concessions this offer asks for. Click any buyer name to see full offer + counters.
        </p>
      ) : null}
    </div>
  );
}

function AssumptionInput({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700">{label}</label>
      <div className="mt-1 flex items-center gap-1">
        <input
          type="number"
          step="0.01"
          min={0}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
        />
        <span className="text-xs text-slate-500">{suffix}</span>
      </div>
    </div>
  );
}

function NewListingOfferForm({
  transactionId,
  onCreated,
  onCancel,
}: {
  transactionId: string;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation("dashboard");
  const [buyerName, setBuyerName] = useState("");
  const [buyerAgentName, setBuyerAgentName] = useState("");
  const [buyerAgentEmail, setBuyerAgentEmail] = useState("");
  const [offerPrice, setOfferPrice] = useState("");
  const [earnestMoney, setEarnestMoney] = useState("");
  const [downPayment, setDownPayment] = useState("");
  const [financingType, setFinancingType] = useState<"" | "cash" | "conventional" | "fha" | "va" | "jumbo" | "other">("");
  const [closingDateProposed, setClosingDateProposed] = useState("");
  const [sellerConcessions, setSellerConcessions] = useState("");
  const [inspectionContingency, setInspectionContingency] = useState(true);
  const [appraisalContingency, setAppraisalContingency] = useState(true);
  const [loanContingency, setLoanContingency] = useState(true);
  const [saleOfHomeContingency, setSaleOfHomeContingency] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    if (!offerPrice.trim()) {
      setErr("Offer price is required.");
      return;
    }
    const priceNum = Number(offerPrice);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setErr("Offer price must be a positive number.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/dashboard/transactions/${transactionId}/listing-offers`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            buyerName: buyerName.trim() || null,
            buyerAgentName: buyerAgentName.trim() || null,
            buyerAgentEmail: buyerAgentEmail.trim() || null,
            offerPrice: priceNum,
            earnestMoney: earnestMoney ? Number(earnestMoney) : null,
            downPayment: downPayment ? Number(downPayment) : null,
            financingType: financingType || null,
            closingDateProposed: closingDateProposed || null,
            sellerConcessions: sellerConcessions ? Number(sellerConcessions) : null,
            inspectionContingency,
            appraisalContingency,
            loanContingency,
            saleOfHomeContingency,
            notes: notes.trim() || null,
          }),
        },
      );
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setErr(body.error ?? "Failed to create offer.");
        return;
      }
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">{t("pages.offersCompare.recordIncoming")}</h3>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Field label={t("pages.offersCompare.buyerName")} value={buyerName} onChange={setBuyerName} placeholder={t("pages.offersCompare.buyerNamePlaceholder")} />
        <Field
          label={t("pages.offersCompare.buyersAgent")}
          value={buyerAgentName}
          onChange={setBuyerAgentName}
          placeholder={t("pages.offersCompare.agentPlaceholder")}
        />
        <Field
          label={t("pages.offersCompare.agentEmail")}
          value={buyerAgentEmail}
          onChange={setBuyerAgentEmail}
          type="email"
          placeholder={t("pages.offersCompare.agentEmailPlaceholder")}
        />
        <Field
          label={t("pages.offersCompare.offerPrice")}
          value={offerPrice}
          onChange={setOfferPrice}
          type="number"
          placeholder="1250000"
        />
        <Field
          label={t("pages.offersCompare.earnestMoney")}
          value={earnestMoney}
          onChange={setEarnestMoney}
          type="number"
          placeholder="30000"
        />
        <Field
          label={t("pages.offersCompare.downPayment")}
          value={downPayment}
          onChange={setDownPayment}
          type="number"
          placeholder="250000"
        />
        <div>
          <label className="block text-xs font-medium text-slate-700">{t("pages.offersCompare.financing")}</label>
          <select
            value={financingType}
            onChange={(e) =>
              setFinancingType(
                e.target.value as "" | "cash" | "conventional" | "fha" | "va" | "jumbo" | "other",
              )
            }
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="">—</option>
            <option value="cash">{t("pages.offersCompare.cash")}</option>
            <option value="conventional">{t("pages.offersCompare.conventional")}</option>
            <option value="fha">{t("pages.offersCompare.fha")}</option>
            <option value="va">VA</option>
            <option value="jumbo">{t("pages.offersCompare.jumbo")}</option>
            <option value="other">{t("pages.offersCompare.other")}</option>
          </select>
        </div>
        <Field
          label={t("pages.offersCompare.proposedClose")}
          value={closingDateProposed}
          onChange={setClosingDateProposed}
          type="date"
        />
        <Field
          label={t("pages.offersCompare.concessions")}
          value={sellerConcessions}
          onChange={setSellerConcessions}
          type="number"
          placeholder="0"
        />
      </div>

      <div className="space-y-1 rounded-lg bg-slate-50 p-3">
        <div className="text-xs font-medium text-slate-700">{t("pages.offersCompare.colContingencies")}</div>
        <div className="flex flex-wrap gap-4 text-sm">
          <Check label={t("pages.offersCompare.inspection")} checked={inspectionContingency} onChange={setInspectionContingency} />
          <Check label={t("pages.labels.appraisal")} checked={appraisalContingency} onChange={setAppraisalContingency} />
          <Check label={t("pages.labels.loan")} checked={loanContingency} onChange={setLoanContingency} />
          <Check
            label={t("pages.offersCompare.saleOfHome")}
            checked={saleOfHomeContingency}
            onChange={setSaleOfHomeContingency}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700">{t("detail.offerDetail.notes")}</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
      </div>

      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >{t("pages.offersCompare.cancel")}</button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={submitting || !offerPrice.trim()}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {submitting ? t("common:status.saving") : t("pages.listingOffersCompare.recordOffer")}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700">{label}</label>
      <input
        type={type ?? "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />
    </div>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4"
      />
      <span>{label}</span>
    </label>
  );
}
