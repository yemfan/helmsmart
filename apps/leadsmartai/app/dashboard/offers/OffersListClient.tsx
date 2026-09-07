"use client";

import { useTranslation } from "react-i18next";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import type { OfferListItem, OfferStatus } from "@/lib/offers/types";

type Filter = "all" | "active" | "won" | "lost";

const STATUS_LABEL: Record<OfferStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  countered: "Countered",
  accepted: "Accepted",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  expired: "Expired",
};

const STATUS_BADGE: Record<OfferStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
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

function formatDate(iso: string, locale?: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function OffersListClient({
  initialOffers,
  initialContactFilter,
}: {
  initialOffers: OfferListItem[];
  initialContactFilter: string | null;
}) {
  const { t } = useTranslation("dashboard");
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  /**
   * Tracks per-row in-flight PATCH so we can disable buttons while
   * a status transition is mid-flight. Keyed by `${offerId}:${status}`
   * so two rows can be acted on independently.
   */
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  /** Optimistic PATCH to /api/dashboard/offers/[id], then router.refresh()
   *  to pull the canonical row (including stamped accepted_at / closed_at).
   *  Errors fall through silently — agent can retry.
   *
   *  Special case: status === "accepted" routes the agent straight to
   *  /dashboard/transactions/new?offerId=<id> after the PATCH succeeds.
   *  That form prefills from the offer and includes the existing
   *  ContractUploader so the agent can attach the signed RPA inline.
   *  We deliberately don't auto-create the transaction in the API — the
   *  agent should see what's about to happen and have a chance to tweak. */
  async function patchStatus(id: string, status: OfferStatus) {
    const key = `${id}:${status}`;
    setPendingAction(key);
    try {
      const res = await fetch(`/api/dashboard/offers/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (res.ok && body.ok) {
        if (status === "accepted") {
          router.push(`/dashboard/transactions/new?offerId=${encodeURIComponent(id)}`);
          return;
        }
        router.refresh();
      }
    } finally {
      setPendingAction((cur) => (cur === key ? null : cur));
    }
  }

  const contactFilterName = useMemo(() => {
    if (!initialContactFilter) return null;
    const match = initialOffers.find((o) => o.contact_id === initialContactFilter);
    return match?.contact_name ?? "selected buyer";
  }, [initialContactFilter, initialOffers]);

  const filtered = useMemo(() => {
    return initialOffers.filter((o) => {
      if (filter === "active" && !["draft", "submitted", "countered"].includes(o.status)) return false;
      if (filter === "won" && o.status !== "accepted") return false;
      if (filter === "lost" && !["rejected", "withdrawn", "expired"].includes(o.status)) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        o.property_address.toLowerCase().includes(q) ||
        (o.city ?? "").toLowerCase().includes(q) ||
        (o.contact_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [initialOffers, filter, search]);

  const stats = useMemo(() => {
    let active = 0;
    let won = 0;
    let lost = 0;
    let pipelineValue = 0;
    let wonValue = 0;
    for (const o of initialOffers) {
      if (["draft", "submitted", "countered"].includes(o.status)) {
        active += 1;
        pipelineValue += o.current_price ?? o.offer_price;
      }
      if (o.status === "accepted") {
        won += 1;
        wonValue += o.current_price ?? o.offer_price;
      }
      if (["rejected", "withdrawn", "expired"].includes(o.status)) lost += 1;
    }
    const closedTotal = won + lost;
    const winRate = closedTotal > 0 ? Math.round((won / closedTotal) * 100) : null;
    return { total: initialOffers.length, active, won, lost, pipelineValue, wonValue, winRate };
  }, [initialOffers]);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{t("offers.title")}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {contactFilterName ? (
              <>{t("pages.offersList.offersFor")}<strong>{contactFilterName}</strong>.{" "}
                <Link href="/dashboard/offers" className="text-blue-600 hover:underline">{t("pages.offersList.clearFilter")}</Link>
              </>
            ) : (
              t("offers.subtitle")
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/offers/build"
            className="rounded-lg bg-[#0072ce] px-3 py-2 text-sm font-medium text-white hover:bg-[#005fa8]"
            title={t("tips.offerAiTermsBuyer")}
          >
            ✨ {t("offers.buildWithAi")}
          </Link>
          <Link
            href={
              initialContactFilter
                ? `/dashboard/offers/upload?contactId=${encodeURIComponent(initialContactFilter)}`
                : "/dashboard/offers/upload"
            }
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            title={t("pages.offersList.uploadHint")}
          >
            ⬆ {t("offers.uploadOffer")}
          </Link>
          <Link
            href="/dashboard/contracts/review"
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            title={t("pages.offersList.reviewHint")}
          >
            🔍 {t("offers.reviewContract")}
          </Link>
          <Link
            href={
              initialContactFilter
                ? `/dashboard/offers/new?contactId=${encodeURIComponent(initialContactFilter)}`
                : "/dashboard/offers/new"
            }
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            + {t("offers.newOffer")}
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label={t("offers.stats.active")} value={String(stats.active)} tone="blue" />
        <Stat label={t("offers.stats.won")} value={String(stats.won)} tone="green" />
        <Stat label={t("offers.stats.lost")} value={String(stats.lost)} tone="gray" />
        <Stat label={t("offers.stats.pipeline")} value={formatMoney(stats.pipelineValue)} tone="blue" />
        <Stat
          label={t("offers.stats.winRate")}
          value={stats.winRate == null ? "—" : `${stats.winRate}%`}
          tone={stats.winRate != null && stats.winRate >= 50 ? "green" : "gray"}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("offers.searchPlaceholder")}
          className="min-w-[240px] flex-1 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        >
          <option value="all">{t("offers.filters.all")}</option>
          <option value="active">{t("offers.filters.active")}</option>
          <option value="won">{t("offers.filters.won")}</option>
          <option value="lost">{t("offers.filters.lost")}</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-600 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{t("offers.columns.property")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("offers.columns.buyer")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("offers.columns.offer")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("offers.columns.current")}</th>
                <th className="px-3 py-2 text-center font-medium">{t("offers.columns.counters")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("offers.columns.status")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("offers.columns.submitted")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("offers.columns.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((o) => (
                <tr key={o.id} className="align-top hover:bg-slate-50 dark:hover:bg-slate-800">
                  <td className="px-3 py-2">
                    <Link
                      href={`/dashboard/offers/${o.id}`}
                      className="font-medium text-slate-900 dark:text-slate-100 hover:underline"
                    >
                      {o.property_address}
                    </Link>
                    {o.city || o.state ? (
                      <div className="text-[11px] text-slate-500">
                        {[o.city, o.state].filter(Boolean).join(", ")}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{o.contact_name ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">
                    {formatMoney(o.offer_price)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {o.current_price != null && o.current_price !== o.offer_price ? (
                      <span className="font-semibold text-slate-900 dark:text-slate-100">{formatMoney(o.current_price)}</span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums text-slate-600 dark:text-slate-400">
                    {o.counter_count > 0 ? o.counter_count : <span className="text-slate-500">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[o.status]}`}
                    >
                      {STATUS_LABEL[o.status]}
                    </span>
                    {o.transaction_id ? (
                      <Link
                        href={`/dashboard/transactions/${o.transaction_id}`}
                        className="ml-2 text-[11px] text-blue-600 hover:underline"
                      >
                        {t("offers.toDeal")}
                      </Link>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-[11px] text-slate-500">
                    {o.submitted_at ? formatDate(o.submitted_at) : <span className="text-slate-500">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <RowActions
                      offer={o}
                      pendingAction={pendingAction}
                      onAccept={(id) => void patchStatus(id, "accepted")}
                      onDecline={(id) => void patchStatus(id, "rejected")}
                    />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-sm text-slate-500">
                    {initialOffers.length === 0 ? (
                      <>
                        <div className="font-medium">{t("offers.empty")}</div>
                        <div className="mt-1 text-[12px]">
                          {t("pages.offersList.emptyBefore")} <strong>+ New offer</strong>{t("pages.offersList.emptyAfter")}
                        </div>
                      </>
                    ) : (
                      t("offers.noMatch")
                    )}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/**
 * Per-row action cluster on the offers list. Status-aware:
 *   • draft / submitted / countered → ✓ Accept, ✗ Decline, ✏ Modify
 *   • accepted / rejected / withdrawn / expired → ✏ Modify only
 *
 * "Accept" and "Decline" PATCH the status directly; the API stamps
 * accepted_at / closed_at server-side. "Modify" routes to the offer
 * detail page where the agent can edit any field, including
 * reversing a wrong outcome via the existing status selector.
 *
 * Icon buttons match the showings + tasks convention (h-7 w-7,
 * lucide icons, tooltip via title) so the visual vocabulary stays
 * consistent across the app.
 */
function RowActions({
  offer,
  pendingAction,
  onAccept,
  onDecline,
}: {
  offer: OfferListItem;
  pendingAction: string | null;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
}) {
  const { t } = useTranslation("dashboard");
  const editHref = `/dashboard/offers/${offer.id}`;
  const status = offer.status;
  const isClosed =
    status === "accepted" ||
    status === "rejected" ||
    status === "withdrawn" ||
    status === "expired";

  const accepting = pendingAction === `${offer.id}:accepted`;
  const declining = pendingAction === `${offer.id}:rejected`;

  return (
    <div className="flex items-center justify-end gap-0.5">
      {!isClosed ? (
        <>
          <RowIconButton
            onClick={() => onAccept(offer.id)}
            disabled={accepting}
            title={t("offers.markAccepted")}
            tone="success"
          >
            <Check className="h-4 w-4" strokeWidth={2.5} />
          </RowIconButton>
          <RowIconButton
            onClick={() => onDecline(offer.id)}
            disabled={declining}
            title={t("offers.markDeclined")}
            tone="danger"
          >
            <X className="h-4 w-4" strokeWidth={2.5} />
          </RowIconButton>
        </>
      ) : null}
      <RowIconButton href={editHref} title={t("offers.modifyOffer")}>
        <Pencil className="h-4 w-4" strokeWidth={2} />
      </RowIconButton>
    </div>
  );
}

function RowIconButton({
  children,
  onClick,
  href,
  title,
  disabled,
  tone,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  title: string;
  disabled?: boolean;
  tone?: "success" | "danger";
}) {
  const toneClasses =
    tone === "success"
      ? "text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
      : tone === "danger"
        ? "text-rose-600 hover:bg-rose-50 hover:text-rose-700"
        : "text-slate-500 hover:bg-slate-100 hover:text-slate-900";
  const className = `inline-flex h-7 w-7 items-center justify-center rounded-md transition disabled:opacity-40 ${toneClasses}`;
  if (href) {
    return (
      <Link href={href} title={title} aria-label={title} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={className}
    >
      {children}
    </button>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "blue" | "green" | "gray" }) {
  const color =
    tone === "blue"
      ? "text-blue-700"
      : tone === "green"
        ? "text-green-700"
        : tone === "gray"
          ? "text-slate-600"
          : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 shadow-sm">
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className={`text-lg font-semibold ${color}`}>{value}</div>
    </div>
  );
}
