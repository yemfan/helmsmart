"use client";

import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CounterDirection, OfferCounterRow, OfferRow, OfferStatus } from "@/lib/offers/types";

/** Keys into `dashboard:detail.offerDetail.status.*` — module scope has no hook. */
const STATUS_KEY: Record<OfferStatus, string> = {
  draft: "draft",
  submitted: "submitted",
  countered: "countered",
  accepted: "accepted",
  rejected: "rejected",
  withdrawn: "withdrawn",
  expired: "expired",
};

const STATUS_BADGE: Record<OfferStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
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

function formatDate(iso: string | null, locale: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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

export function OfferDetailClient({
  offer: initialOffer,
  counters: initialCounters,
  contactName,
}: {
  offer: OfferRow;
  counters: OfferCounterRow[];
  contactName: string | null;
}) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const router = useRouter();
  const [offer, setOffer] = useState(initialOffer);
  const [counters, setCounters] = useState(initialCounters);
  const [savingStatus, setSavingStatus] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  async function saveStatus(next: OfferStatus) {
    setSavingStatus(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/dashboard/offers/${offer.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        offer?: OfferRow;
        error?: string;
      };
      if (!res.ok || !body.ok || !body.offer) {
        setMsg({ tone: "err", text: body.error ?? t("detail.offerDetail.saveFailed") });
        return;
      }
      // Special case: flipping to "accepted" routes the agent to
      // the prefilled new-transaction form so they can review +
      // upload the signed RPA in one step (matches the offers-list
      // ✓ Accept behavior from PR #359). Skip the redirect when
      // the offer already has a back-linked transaction — that
      // means the agent has already converted; re-flipping status
      // shouldn't drag them through the form again.
      if (next === "accepted" && !body.offer.transaction_id) {
        router.push(
          `/dashboard/transactions/new?offerId=${encodeURIComponent(offer.id)}`,
        );
        return;
      }
      setOffer(body.offer);
      setMsg({ tone: "ok", text: t("detail.offerDetail.statusSaved") });
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : t("detail.offerDetail.networkError") });
    } finally {
      setSavingStatus(false);
    }
  }

  function convertToTransaction() {
    // Used to call POST /convert directly (auto-create), but that
    // produced an inconsistent UX vs flipping status to accepted —
    // the latter routes through the prefilled new-transaction form
    // (PR #359), this used to skip straight to the detail page.
    // Now both paths land on the same form so the agent always
    // gets a chance to review fields + upload the signed RPA.
    router.push(
      `/dashboard/transactions/new?offerId=${encodeURIComponent(offer.id)}`,
    );
  }

  async function onDelete() {
    if (!confirm(t("detail.offerDetail.confirmDelete"))) return;
    const res = await fetch(`/api/dashboard/offers/${offer.id}`, { method: "DELETE" });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !body.ok) {
      setMsg({ tone: "err", text: body.error ?? t("detail.offerDetail.deleteFailed") });
      return;
    }
    router.push("/dashboard/offers");
  }

  const isClosed = ["accepted", "rejected", "withdrawn", "expired"].includes(offer.status);
  const isAccepted = offer.status === "accepted";

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <div className="text-xs text-slate-500">
          <Link href="/dashboard/offers" className="hover:underline">{t("pages.offerDetail.offers")}</Link>
          {" / "}
          <span>{offer.property_address}</span>
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{offer.property_address}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <span>
            Buyer:{" "}
            <Link
              href={`/dashboard/offers?contactId=${encodeURIComponent(offer.contact_id)}`}
              className="text-blue-600 hover:underline"
            >
              {contactName ?? "(unknown buyer)"}
            </Link>
          </span>
          <span className="text-slate-400">·</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[offer.status]}`}
          >
            {t(`detail.offerDetail.status.${STATUS_KEY[offer.status]}`)}
          </span>
          {offer.transaction_id ? (
            <Link
              href={`/dashboard/transactions/${offer.transaction_id}`}
              className="text-[12px] text-blue-600 hover:underline"
            >
              → open deal
            </Link>
          ) : null}
        </div>
      </div>

      {msg ? (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            msg.tone === "ok"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
          aria-live="polite"
        >
          {msg.text}
        </div>
      ) : null}

      <div className="grid gap-5 md:grid-cols-3">
        <div className="space-y-4 md:col-span-2">
          <Card title={t("detail.offerDetail.terms")}>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Detail label={t("detail.offerDetail.listPrice")} value={formatMoney(offer.list_price, locale)} />
              <Detail label={t("detail.offerDetail.offerPrice")} value={formatMoney(offer.offer_price, locale)} />
              <Detail
                label={t("detail.offerDetail.currentPrice")}
                value={
                  offer.current_price != null && offer.current_price !== offer.offer_price ? (
                    <span className="font-semibold text-slate-900">{formatMoney(offer.current_price, locale)}</span>
                  ) : (
                    formatMoney(offer.current_price ?? offer.offer_price, locale)
                  )
                }
              />
              <Detail label={t("detail.offerDetail.earnestMoney")} value={formatMoney(offer.earnest_money, locale)} />
              <Detail label={t("detail.offerDetail.downPayment")} value={formatMoney(offer.down_payment, locale)} />
              <Detail label={t("detail.offerDetail.financing")} value={offer.financing_type ?? "—"} />
              <Detail label={t("detail.offerDetail.proposedClosing")} value={formatDate(offer.closing_date_proposed, locale)} />
              <Detail label={t("detail.offerDetail.offerExpires")} value={formatDateTime(offer.offer_expires_at, locale)} />
              <Detail
                label={t("detail.offerDetail.contingencies")}
                wide
                value={
                  <div className="flex flex-wrap gap-1.5">
                    {offer.inspection_contingency ? <Chip>{t("detail.offerDetail.inspection")}</Chip> : null}
                    {offer.appraisal_contingency ? <Chip>{t("detail.offerDetail.appraisal")}</Chip> : null}
                    {offer.loan_contingency ? <Chip>{t("detail.offerDetail.loan")}</Chip> : null}
                    {!offer.inspection_contingency &&
                    !offer.appraisal_contingency &&
                    !offer.loan_contingency ? (
                      <span className="text-slate-500 text-xs">{t("offers.noneWaived")}</span>
                    ) : null}
                  </div>
                }
              />
              {offer.contingency_notes ? (
                <Detail label={t("detail.offerDetail.otherContingencies")} value={offer.contingency_notes} wide />
              ) : null}
              {offer.notes ? <Detail label={t("detail.offerDetail.notes")} value={offer.notes} wide /> : null}
            </dl>
          </Card>

          <Card title={t("pages.labels.status")}>
            <div className="flex flex-wrap gap-2">
              {(
                ["draft", "submitted", "countered", "accepted", "rejected", "withdrawn", "expired"] as OfferStatus[]
              ).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void saveStatus(s)}
                  disabled={savingStatus || offer.status === s}
                  className={`rounded-lg border px-3 py-1.5 text-sm ${
                    offer.status === s
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  } disabled:opacity-60`}
                >
                  {t(`detail.offerDetail.status.${STATUS_KEY[s]}`)}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              Submitting stamps submitted_at. Accepting stamps accepted_at. Rejected / withdrawn /
              expired stamp closed_at.
            </p>
          </Card>

          <ActivityTimeline
            offer={offer}
            counters={counters}
            disabled={isClosed}
            onCounterAdded={(counter) => {
              setCounters((prev) => [...prev, counter]);
              // Refetch the offer to reflect status → "countered" + new current_price.
              void (async () => {
                const res = await fetch(`/api/dashboard/offers/${offer.id}`);
                const body = (await res.json().catch(() => ({}))) as {
                  ok?: boolean;
                  offer?: OfferRow;
                };
                if (body.ok && body.offer) setOffer(body.offer);
              })();
            }}
          />
        </div>

        <div className="space-y-4">
          <Card title={t("detail.offerDetail.quickActions")}>
            <div className="space-y-2">
              {isAccepted && !offer.transaction_id ? (
                <button
                  type="button"
                  onClick={() => convertToTransaction()}
                  className="block w-full rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-left text-sm font-medium text-green-800 hover:bg-green-100"
                >
                  ✅ Convert to transaction
                  <div className="text-[11px] font-normal text-green-700">{t("pages.offerDetail.createsBuyerRep")}</div>
                </button>
              ) : null}

              {offer.showing_id ? (
                <Link
                  href={`/dashboard/showings/${offer.showing_id}`}
                  className="block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  ← Back to originating showing
                </Link>
              ) : null}

              <button
                type="button"
                onClick={() => void onDelete()}
                className="block w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
              >
                🗑 Delete offer
              </button>
            </div>
          </Card>

          <Card title={t("detail.offerDetail.timeline")}>
            <dl className="space-y-2 text-sm">
              <Detail label={t("detail.offerDetail.created")} value={formatDateTime(offer.created_at, locale)} />
              <Detail label={t("pages.labels.submitted")} value={formatDateTime(offer.submitted_at, locale)} />
              <Detail label={t("pages.labels.accepted")} value={formatDateTime(offer.accepted_at, locale)} />
              <Detail label={t("detail.offerDetail.closed")} value={formatDateTime(offer.closed_at, locale)} />
            </dl>
          </Card>
        </div>
      </div>
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
  const { t } = useTranslation("dashboard");
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
      {children}
    </span>
  );
}

/**
 * Activity timeline — synthesizes lifecycle events from the offer
 * row + its counters into a single chronological feed.
 *
 * Read-only on purpose. Inputs (status changes, counter records,
 * delete) live in their own dedicated cards (Status, Counter
 * history, Quick actions) — surfacing them here too would just
 * duplicate the affordance and the user has to land on the source
 * card to actually act anyway.
 *
 * Events synthesized:
 *
 *   Drafted         ← offer.created_at
 *   Submitted       ← offer.submitted_at (skipped when status='draft')
 *   Counter (each)  ← offer_counters[i].created_at
 *                     direction discriminates the label:
 *                       seller_to_buyer → t("detail.offerDetail.sellerCountered")
 *                       buyer_to_seller → t("detail.offerDetail.weCountered")
 *   Accepted        ← offer.accepted_at
 *   Rejected        ← offer.closed_at when status='rejected'
 *   Withdrawn       ← offer.closed_at when status='withdrawn'
 *   Expired         ← offer.closed_at when status='expired'
 *
 * Sorted newest-first so the latest event is at the top — what
 * the agent usually wants when scanning a deal in motion.
 */
type ActivityEvent = {
  at: string;
  icon: string;
  label: string;
  detail?: string;
};

function buildActivity(
  offer: OfferRow,
  counters: OfferCounterRow[],
  t: (k: string) => string,
  locale: string,
): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  events.push({
    at: offer.created_at,
    icon: "📝",
    label: t("detail.offerDetail.drafted"),
  });
  if (offer.submitted_at) {
    events.push({
      at: offer.submitted_at,
      icon: "📤",
      label: t("detail.offerDetail.submittedToAgent"),
      detail:
        offer.offer_price != null
          ? `at ${formatMoney(offer.offer_price, locale)}`
          : undefined,
    });
  }
  for (const c of counters) {
    const isFromSeller = c.direction === "seller_to_buyer";
    events.push({
      at: c.created_at,
      icon: "🔁",
      label: isFromSeller
        ? `Counter #${c.counter_number} from seller`
        : `Counter #${c.counter_number} sent to seller`,
      detail: [
        c.price != null ? `at ${formatMoney(c.price, locale)}` : null,
        c.notes ?? null,
      ]
        .filter(Boolean)
        .join(" · ") || undefined,
    });
  }
  if (offer.accepted_at) {
    events.push({
      at: offer.accepted_at,
      icon: "✅",
      label: "Accepted",
      detail:
        offer.current_price != null && offer.current_price !== offer.offer_price
          ? `Final price ${formatMoney(offer.current_price, locale)}`
          : undefined,
    });
  }
  if (offer.closed_at && offer.status !== "accepted") {
    const closedLabel =
      offer.status === "rejected"
        ? { icon: "❌", label: t("detail.offerDetail.rejectedBySeller") }
        : offer.status === "withdrawn"
          ? { icon: "↩", label: "Withdrawn" }
          : offer.status === "expired"
            ? { icon: "⏰", label: "Expired" }
            : { icon: "⚪", label: t("detail.offerDetail.closed") };
    events.push({
      at: offer.closed_at,
      icon: closedLabel.icon,
      label: closedLabel.label,
    });
  }
  // Newest first.
  events.sort((a, b) => b.at.localeCompare(a.at));
  return events;
}

function ActivityTimeline({
  offer,
  counters,
  onCounterAdded,
  disabled,
}: {
  offer: OfferRow;
  counters: OfferCounterRow[];
  /** Fired after a successful counter POST. Parent updates its
   *  counters state + refetches the offer (status → 'countered'
   *  + new current_price). */
  onCounterAdded: (c: OfferCounterRow) => void;
  /** Hide the add-counter affordance on closed offers (accepted /
   *  rejected / withdrawn / expired). */
  disabled: boolean;
}) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const events = buildActivity(offer, counters, t, locale);

  // Inline add-counter form state. Used to live in a separate
  // CounterTimeline card; folded in here so the Activity card
  // is the single surface for both reading the deal narrative
  // and adding to it.
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
      const res = await fetch(`/api/dashboard/offers/${offer.id}/counters`, {
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
        counter?: OfferCounterRow;
        error?: string;
      };
      if (!res.ok || !body.ok || !body.counter) {
        setErr(body.error ?? t("detail.offerDetail.counterFailed"));
        return;
      }
      onCounterAdded(body.counter);
      setPrice("");
      setNotes("");
      setAdding(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("detail.offerDetail.networkError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">{t("detail.offerDetail.activity")}</h2>
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

      {adding ? (
        <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3">
          <div>
            <label className="block text-xs font-medium text-slate-700">{t("detail.offerDetail.direction")}</label>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as CounterDirection)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="seller_to_buyer">Seller → Buyer (they countered us)</option>
              <option value="buyer_to_seller">Buyer → Seller (we countered them)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">{t("offers.newPriceOptional")}</label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">{t("detail.offerDetail.notes")}</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Closing moved to 45d, EMD bumped to 40k…"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </div>
          {err ? <p className="text-xs text-red-600">{err}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setErr(null);
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >{t("pages.offerDetail.cancel")}</button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={saving}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "Recording…" : t("detail.offerDetail.recordCounter")}
            </button>
          </div>
        </div>
      ) : null}

      {events.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          {disabled ? "Offer is closed — no further counters." : t("detail.offerDetail.noActivity")}
        </p>
      ) : (
        <ol className="mt-3 space-y-2">
          {events.map((e, i) => (
            <li
              key={`${e.at}-${i}`}
              className="flex gap-3 rounded-lg border border-slate-100 px-3 py-2"
            >
              <div className="shrink-0 text-base leading-snug" aria-hidden>
                {e.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-900">{e.label}</div>
                {e.detail ? (
                  <div className="mt-0.5 text-[12px] text-slate-600">{e.detail}</div>
                ) : null}
              </div>
              <div className="shrink-0 text-right text-[11px] text-slate-500">
                {formatDateTime(e.at, locale)}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
