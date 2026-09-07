"use client";

import Link from "next/link";
import { useConfirm } from "@/components/ui/useConfirm";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";
import { PlaybooksPanel } from "@/components/dashboard/PlaybooksPanel";
import type {
  OpenHouseRow,
  OpenHouseStatus,
  OpenHouseVisitorRow,
  VisitorTimeline,
} from "@/lib/open-houses/types";

const STATUS_LABEL: Record<OpenHouseStatus, string> = {
  scheduled: "Scheduled",
  in_progress: "Live now",
  completed: "Completed",
  cancelled: "Cancelled",
};

const TIMELINE_LABEL: Record<VisitorTimeline, string> = {
  now: "Actively looking",
  "3_6_months": "3-6 months",
  "6_12_months": "6-12 months",
  later: "Just exploring",
  just_looking: "Just curious",
};

const TIMELINE_TONE: Record<VisitorTimeline, string> = {
  now: "bg-red-100 text-red-700",
  "3_6_months": "bg-amber-100 text-amber-800",
  "6_12_months": "bg-blue-100 text-blue-700",
  later: "bg-slate-100 text-slate-600",
  just_looking: "bg-slate-100 text-slate-500",
};

function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatMoney(n: number | null, locale: string): string {
  if (n == null) return "—";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function OpenHouseDetailClient({
  openHouse: initialOH,
  visitors: initialVisitors,
}: {
  openHouse: OpenHouseRow;
  visitors: OpenHouseVisitorRow[];
}) {
  const { t, i18n } = useTranslation("dashboard");
  const confirmDialog = useConfirm();
  const locale = intlLocale(i18n.language);
  const router = useRouter();
  const [oh, setOH] = useState(initialOH);
  const [visitors] = useState(initialVisitors);
  const [savingStatus, setSavingStatus] = useState(false);
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const publicUrl = useMemo(() => {
    // Prefer the agent's own origin so the QR code encodes the right
    // host. In the browser `window.location.origin` is always correct.
    if (typeof window !== "undefined") return `${window.location.origin}/oh/${oh.signin_slug}`;
    return `/oh/${oh.signin_slug}`;
  }, [oh.signin_slug]);

  async function saveStatus(next: OpenHouseStatus) {
    setSavingStatus(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/dashboard/open-houses/${oh.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        openHouse?: OpenHouseRow;
        error?: string;
      };
      if (!res.ok || !body.ok || !body.openHouse) {
        setMsg({ tone: "err", text: body.error ?? "Failed to save." });
        return;
      }
      setOH(body.openHouse);
      setMsg({ tone: "ok", text: t("pages.openHouseDetail.saved") });
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : "Network error." });
    } finally {
      setSavingStatus(false);
    }
  }

  async function onDelete() {
    if (!await confirmDialog("Delete this open house and all its visitors? Cannot be undone.")) return;
    const res = await fetch(`/api/dashboard/open-houses/${oh.id}`, { method: "DELETE" });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !body.ok) {
      setMsg({ tone: "err", text: body.error ?? "Failed to delete." });
      return;
    }
    router.push("/dashboard/open-houses");
  }

  async function onCancelSeries() {
    if (
      !await confirmDialog(
        "Cancel this open house AND every future one in the same series? " +
          "Past occurrences are left alone.",
      )
    ) {
      return;
    }
    try {
      const res = await fetch(
        `/api/dashboard/open-houses/${oh.id}/cancel-series`,
        { method: "POST" },
      );
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        cancelled?: number;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        setMsg({ tone: "err", text: body.error ?? "Failed to cancel series." });
        return;
      }
      setMsg({
        tone: "ok",
        text: `Cancelled ${body.cancelled ?? 0} occurrence(s).`,
      });
      setOH((prev) => ({ ...prev, status: "cancelled" }));
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : "Network error." });
    }
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMsg({ tone: "err", text: t("pages.openHouseDetail.copyFailed") });
    }
  }

  const locationLine = [oh.city, oh.state, oh.zip].filter(Boolean).join(", ");

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <div className="text-xs text-slate-500">
          <Link href="/dashboard/open-houses" className="hover:underline">{t("pages.openHouseDetail.openHouses")}</Link>
          {" / "}
          <span>{oh.property_address}</span>
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{oh.property_address}</h1>
        <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {formatDate(oh.start_at, locale)} · {formatTime(oh.start_at, locale)} – {formatTime(oh.end_at, locale)}
          {locationLine ? ` · ${locationLine}` : ""}
          {oh.list_price ? ` · ${formatMoney(oh.list_price, locale)}` : ""}
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
        {/* LEFT: visitor sign-in operations (the hero for event-day setup).
            Layout deliberately leads with the printed-flyer affordance
            since that's where the QR code lives at the door. The Open
            iPad kiosk button + Copy link cover the digital paths. */}
        <div className="space-y-4 md:col-span-1">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("pages.openHouseDetail.visitorSignIn")}</h2>
            <p className="mt-1 text-xs text-slate-500">{t("pages.openHouseDetail.flyerNote")}</p>

            <Link
              href={`/dashboard/open-houses/flyer?openHouseId=${oh.id}`}
              className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              {t("pages.openHouseDetail.printFlyer")}
            </Link>
            <p className="mt-1 text-[11px] text-slate-500">{t("pages.openHouseDetail.flyerIncludes")}</p>

            <div className="mt-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 p-2 text-center font-mono text-[11px] text-slate-700 dark:text-slate-300 break-all">
              {publicUrl}
            </div>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => void copyUrl()}
                className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                {copied ? t("pages.openHouseDetail.copied") : t("pages.openHouseDetail.copyLink")}
              </button>
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >{t("pages.openHouseDetail.open")}</a>
            </div>
            <a
              href={`/oh/${oh.signin_slug}/kiosk`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 block rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-center text-sm font-medium text-emerald-800 hover:bg-emerald-100"
            >
              {t("pages.openHouseDetail.openKiosk")}
            </a>
            <p className="mt-1 text-[11px] text-slate-500">{t("pages.openHouseDetail.kioskNote")}</p>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("pages.openHouseDetail.status")}</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["scheduled", "completed", "cancelled"] as OpenHouseStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void saveStatus(s)}
                  disabled={savingStatus || oh.status === s}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    oh.status === s
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                  } disabled:opacity-60`}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">{t("pages.openHouseDetail.cancelledNote")}</p>
          </div>

          {oh.host_notes ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("pages.openHouseDetail.hostNotes")}</h3>
              <p className="mt-2 whitespace-pre-line text-sm text-slate-700 dark:text-slate-300">{oh.host_notes}</p>
            </div>
          ) : null}

          {oh.recurrence_group_id ? (
            <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-4">
              <h3 className="text-sm font-semibold text-purple-900">{t("pages.openHouseDetail.recurring")}</h3>
              <p className="mt-1 text-[11px] text-purple-700">{t("pages.openHouseDetail.seriesNote")}</p>
              <button
                type="button"
                onClick={() => void onCancelSeries()}
                className="mt-2 w-full rounded-lg border border-purple-300 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-purple-800 hover:bg-purple-100"
              >{t("pages.openHouseDetail.cancelSeries")}</button>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void onDelete()}
            className="w-full rounded-lg border border-red-200 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
          >
            {t("pages.openHouseDetail.deleteOpenHouse")}
          </button>
        </div>

        {/* RIGHT: visitors */}
        <div className="space-y-4 md:col-span-2">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t("pages.openHouseDetail.visitorsN", { count: visitors.length })}
              </h2>
              <span className="text-[11px] text-slate-500">
                {t("pages.openHouseDetail.optedInN", { count: visitors.filter((v) => v.marketing_consent).length })}
              </span>
            </div>

            {visitors.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">{t("pages.openHouseDetail.noSignIns")}</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-xs text-slate-600 dark:text-slate-400">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium">{t("pages.openHouseDetail.colNameContact")}</th>
                      <th className="px-2 py-1.5 text-left font-medium">{t("pages.openHouseDetail.colTimeline")}</th>
                      <th className="px-2 py-1.5 text-left font-medium">{t("pages.openHouseDetail.colAgented")}</th>
                      <th className="px-2 py-1.5 text-center font-medium">{t("pages.openHouseDetail.colConsent")}</th>
                      <th className="px-2 py-1.5 text-left font-medium">{t("pages.openHouseDetail.colSignedIn")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {visitors.map((v) => (
                      <tr key={v.id} className="align-top">
                        <td className="px-2 py-2">
                          {v.contact_id ? (
                            <Link
                              href={`/dashboard/contacts?list=leads&highlight=${encodeURIComponent(v.contact_id)}`}
                              className="font-medium text-slate-900 dark:text-slate-100 hover:underline"
                            >
                              {v.name ?? "(no name)"}
                            </Link>
                          ) : (
                            <span className="font-medium text-slate-900 dark:text-slate-100">
                              {v.name ?? "(no name)"}
                            </span>
                          )}
                          <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-slate-500">
                            {v.email ? <span>{v.email}</span> : null}
                            {v.phone ? <span>{v.phone}</span> : null}
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          {v.timeline ? (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${TIMELINE_TONE[v.timeline]}`}
                            >
                              {TIMELINE_LABEL[v.timeline]}
                            </span>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-[12px] text-slate-600 dark:text-slate-400">
                          {v.is_buyer_agented ? (
                            <span>
                              {t("pages.openHouseDetail.yes")}
                              {v.buyer_agent_name ? (
                                <span className="text-[10px] text-slate-500"> · {v.buyer_agent_name}</span>
                              ) : null}
                            </span>
                          ) : (
                            <span className="text-green-700">No</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-center">
                          {v.marketing_consent ? (
                            <span title={t("pages.openHouseDetail.willReceive")}>✅</span>
                          ) : (
                            <span className="text-slate-300" title={t("pages.openHouseDetail.notOptedIn")}>—</span>
                          )}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap text-[11px] text-slate-500">
                          {new Date(v.created_at).toLocaleString(locale, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("pages.openHouseDetail.followUp")}</h3>
            <p className="mt-1 text-xs text-slate-500">{t("pages.openHouseDetail.followUpNote")}</p>
            <ul className="mt-3 space-y-1 text-[12px] text-slate-600 dark:text-slate-400">
              <li>
                📧{" "}
                {t("pages.openHouseDetail.thankYouSent", {
                  sent: visitors.filter((v) => v.thank_you_sent_at).length,
                  total: visitors.filter((v) => v.marketing_consent && !v.is_buyer_agented).length,
                })}
              </li>
              <li>
                📱{" "}
                {t("pages.openHouseDetail.checkInsSent", {
                  sent: visitors.filter((v) => v.check_in_sent_at).length,
                  total: visitors.filter((v) => v.marketing_consent && !v.is_buyer_agented).length,
                })}
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Playbooks — agent-applied checklists anchored to this open
          house. Default anchor = the event's start date. */}
      <PlaybooksPanel
        anchorKind="open_house"
        anchorId={oh.id}
        defaultAnchorDate={oh.start_at.slice(0, 10)}
      />
    </div>
  );
}
