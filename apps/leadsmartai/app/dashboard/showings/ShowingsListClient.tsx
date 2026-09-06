"use client";

import { useTranslation } from "react-i18next";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Check, FileText, MessageCircle, X } from "lucide-react";
import type { ShowingListItem, ShowingStatus } from "@/lib/showings/types";

type Filter = "all" | "upcoming" | "attended" | "cancelled";

/** Keys into `dashboard:showings.status.*` — module scope has no hook. */
const STATUS_KEY: Record<ShowingStatus, string> = {
  scheduled: "scheduled",
  attended: "attended",
  cancelled: "cancelled",
  no_show: "no_show",
};

const STATUS_BADGE: Record<ShowingStatus, string> = {
  scheduled: "bg-blue-100 text-blue-800",
  attended: "bg-green-100 text-green-800",
  cancelled: "bg-slate-100 text-slate-600",
  no_show: "bg-amber-100 text-amber-800",
};

function formatDate(iso: string, locale?: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(iso: string, locale?: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
}

export function ShowingsListClient({
  initialShowings,
  initialContactFilter,
}: {
  initialShowings: ShowingListItem[];
  initialContactFilter: string | null;
}) {
  const { t } = useTranslation("dashboard");
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  /**
   * Tracks per-row pending action so an in-flight PATCH disables the
   * row's buttons. Keyed by `${showingId}:${action}` so two rows can
   * be acted on independently without a queue.
   */
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  /** Optimistic-PATCH the showing's status, then refresh the server
   *  component to pick up the canonical row. Falls back gracefully on
   *  network / 4xx errors — the agent can retry. */
  async function patchStatus(id: string, status: ShowingStatus) {
    const key = `${id}:${status}`;
    setPendingAction(key);
    try {
      const res = await fetch(`/api/dashboard/showings/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (res.ok && body.ok) router.refresh();
    } finally {
      setPendingAction((cur) => (cur === key ? null : cur));
    }
  }

  const contactFilterName = useMemo(() => {
    if (!initialContactFilter) return null;
    const match = initialShowings.find((s) => s.contact_id === initialContactFilter);
    return match?.contact_name ?? "selected buyer";
  }, [initialContactFilter, initialShowings]);

  const filtered = useMemo(() => {
    const now = Date.now();
    return initialShowings.filter((s) => {
      if (filter === "upcoming" && (s.status !== "scheduled" || new Date(s.scheduled_at).getTime() < now)) return false;
      if (filter === "attended" && s.status !== "attended") return false;
      if (filter === "cancelled" && s.status !== "cancelled" && s.status !== "no_show") return false;

      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        s.property_address.toLowerCase().includes(q) ||
        (s.city ?? "").toLowerCase().includes(q) ||
        (s.contact_name ?? "").toLowerCase().includes(q) ||
        (s.listing_agent_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [initialShowings, filter, search]);

  const stats = useMemo(() => {
    const now = Date.now();
    let upcoming = 0;
    let attended = 0;
    let loved = 0;
    let wouldOffer = 0;
    for (const s of initialShowings) {
      if (s.status === "scheduled" && new Date(s.scheduled_at).getTime() >= now) upcoming += 1;
      if (s.status === "attended") attended += 1;
      if (s.feedback_reaction === "love") loved += 1;
      if (s.feedback_would_offer) wouldOffer += 1;
    }
    return { total: initialShowings.length, upcoming, attended, loved, wouldOffer };
  }, [initialShowings]);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{t("showings.title")}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {contactFilterName ? (
              <>{t("pages.showingsList.visitsFor")}<strong>{contactFilterName}</strong>.{" "}
                <Link href="/dashboard/showings" className="text-blue-600 hover:underline">{t("pages.showingsList.clearFilter")}</Link>
              </>
            ) : (
              t("showings.subtitle")
            )}
          </p>
        </div>
        <Link
          href={
            initialContactFilter
              ? `/dashboard/showings/new?contactId=${encodeURIComponent(initialContactFilter)}`
              : "/dashboard/showings/new"
          }
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          {t("showings.schedule")}
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label={t("showings.stats.total")} value={stats.total} />
        <Stat label={t("showings.stats.upcoming")} value={stats.upcoming} tone="blue" />
        <Stat label={t("showings.stats.attended")} value={stats.attended} tone="green" />
        <Stat label={t("showings.stats.loved")} value={stats.loved} tone="red" />
        <Stat label={t("showings.stats.wouldOffer")} value={stats.wouldOffer} tone="amber" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("showings.searchPlaceholder")}
          className="min-w-[240px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <option value="all">{t("showings.filters.all")}</option>
          <option value="upcoming">{t("showings.filters.upcoming")}</option>
          <option value="attended">{t("showings.filters.attended")}</option>
          <option value="cancelled">{t("showings.filterCancelled")}</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{t("showings.columns.when")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("showings.columns.property")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("showings.columns.buyer")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("showings.columns.listingAgent")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("showings.columns.status")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("showings.columns.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((s) => (
                <tr key={s.id} className="align-top hover:bg-slate-50">
                  <td className="whitespace-nowrap px-3 py-2">
                    <Link href={`/dashboard/showings/${s.id}`} className="block">
                      <div className="font-medium text-slate-900">{formatDate(s.scheduled_at)}</div>
                      <div className="text-[11px] text-slate-500">{formatTime(s.scheduled_at)}</div>
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/dashboard/showings/${s.id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {s.property_address}
                    </Link>
                    {s.city || s.state ? (
                      <div className="text-[11px] text-slate-500">
                        {[s.city, s.state].filter(Boolean).join(", ")}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-slate-700">{s.contact_name ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {s.listing_agent_name ? (
                      <div>{s.listing_agent_name}</div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                    {s.listing_agent_email ? (
                      <div className="text-[11px] text-slate-500">{s.listing_agent_email}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[s.status]}`}
                    >
                      {t(`showings.status.${STATUS_KEY[s.status]}`)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <RowActions
                      showing={s}
                      pendingAction={pendingAction}
                      onMarkAttended={(id) => void patchStatus(id, "attended")}
                      onCancel={(id) => void patchStatus(id, "cancelled")}
                    />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-sm text-slate-500">
                    {initialShowings.length === 0 ? (
                      <>
                        <div className="font-medium">{t("showings.empty")}</div>
                        <div className="mt-1 text-[12px]">
                          {t("pages.showingsList.emptyBefore")} <strong>{t("showings.schedule")}</strong>{t("pages.showingsList.emptyAfter")}
                        </div>
                      </>
                    ) : (
                      t("showings.noMatch")
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
 * Per-row action cluster on the showings list. Status-aware:
 *   • scheduled → ✓ Mark attended, ✗ Cancel, 📝 Submit offer
 *   • attended  → 📝 Submit offer, 💬 Capture feedback
 *   • cancelled / no_show → no inline actions; click row to detail to reschedule
 *
 * Icon buttons match the Tasks page convention (h-7 w-7, lucide icons,
 * tooltip via title) so the visual vocabulary stays consistent across
 * the app.
 */
function RowActions({
  showing,
  pendingAction,
  onMarkAttended,
  onCancel,
}: {
  showing: ShowingListItem;
  pendingAction: string | null;
  onMarkAttended: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const { t } = useTranslation("dashboard");
  const offerHref = `/dashboard/offers/new?contactId=${encodeURIComponent(showing.contact_id)}&showingId=${encodeURIComponent(showing.id)}`;
  const feedbackHref = `/dashboard/showings/${showing.id}#feedback`;
  const status = showing.status;

  const markingDone = pendingAction === `${showing.id}:attended`;
  const cancelling = pendingAction === `${showing.id}:cancelled`;

  return (
    <div className="flex items-center justify-end gap-0.5">
      {status === "scheduled" ? (
        <>
          <RowIconButton
            onClick={() => onMarkAttended(showing.id)}
            disabled={markingDone}
            title={t("showings.markAttended")}
            tone="success"
          >
            <Check className="h-4 w-4" strokeWidth={2.5} />
          </RowIconButton>
          <RowIconButton
            onClick={() => onCancel(showing.id)}
            disabled={cancelling}
            title={t("showings.cancel")}
            tone="danger"
          >
            <X className="h-4 w-4" strokeWidth={2.5} />
          </RowIconButton>
          <RowIconButton href={offerHref} title={t("showings.submitOffer")}>
            <FileText className="h-4 w-4" strokeWidth={2} />
          </RowIconButton>
        </>
      ) : null}

      {status === "attended" ? (
        <>
          <RowIconButton href={offerHref} title={t("showings.submitOffer")} tone="success">
            <FileText className="h-4 w-4" strokeWidth={2} />
          </RowIconButton>
          <RowIconButton href={feedbackHref} title={t("showings.captureFeedback")}>
            <MessageCircle className="h-4 w-4" strokeWidth={2} />
          </RowIconButton>
        </>
      ) : null}

      {status === "cancelled" || status === "no_show" ? (
        <span className="text-[11px] text-slate-400">—</span>
      ) : null}
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

function Stat({ label, value, tone }: { label: string; value: number; tone?: "blue" | "green" | "red" | "amber" }) {
  const color =
    tone === "blue"
      ? "text-blue-700"
      : tone === "green"
        ? "text-green-700"
        : tone === "red"
          ? "text-red-600"
          : tone === "amber"
            ? "text-amber-700"
            : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className={`text-xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}
