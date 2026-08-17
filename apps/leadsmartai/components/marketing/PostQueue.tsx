"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";

/**
 * The post queue: what's about to go out, when, and to where — with the gate.
 *
 * In 'review' mode every generated post lands here as `awaiting_approval` and
 * WAITS. Nothing publishes until someone clicks Approve. This is the surface
 * that makes "the AI writes our marketing" safe to leave running.
 */

type QueueItem = {
  id: string;
  platform: string;
  caption: string;
  image_url: string | null;
  scheduled_for: string;
  status:
    | "awaiting_approval"
    | "scheduled"
    | "posting"
    | "posted"
    | "failed"
    | "cancelled";
  attempt_count: number;
  last_error: string | null;
  published_at: string | null;
  accountName: string | null;
  /** The Boss's pre-publish fact-check (assisted mode only; null otherwise). */
  review_verdict: "clean" | "flagged" | null;
  review_issues: { quote: string; why: string }[] | null;
};

const PLATFORM_LABEL: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
};

export default function PostQueue() {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [pending, setPending] = useState<QueueItem[]>([]);
  const [recent, setRecent] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/social/queue");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Could not load the queue.");
      setPending(json.pending ?? []);
      setRecent(json.recent ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the queue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(id: string, action: "approve" | "cancel", scheduledFor?: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/social/queue/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, scheduledFor }),
      });
      const json = await res.json();
      // A 409 means the post moved on under us (the cron grabbed it, someone
      // else acted). Re-syncing is more honest than showing a stale row.
      if (!json.ok) {
        setError(json.error || "That didn't work.");
        if (json.resync) await load();
        return;
      }
      await load();
      setError(null);
    } catch {
      setError("That didn't work.");
    } finally {
      setBusyId(null);
    }
  }

  async function reschedule(item: QueueItem) {
    const current = new Date(item.scheduled_for);
    const input = window.prompt(
      "Publish at (YYYY-MM-DD HH:MM, your local time):",
      fmtInput(current),
    );
    if (!input) return;
    const parsed = new Date(input.replace(" ", "T"));
    if (Number.isNaN(parsed.getTime())) {
      setError("Couldn't read that date. Use YYYY-MM-DD HH:MM.");
      return;
    }
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/social/queue/${item.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reschedule", scheduledFor: parsed.toISOString() }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "Couldn't reschedule.");
        if (json.resync) await load();
        return;
      }
      await load();
      setError(null);
    } catch {
      setError("Couldn't reschedule.");
    } finally {
      setBusyId(null);
    }
  }

  async function approveAll() {
    setBusyId("all");
    try {
      const res = await fetch("/api/social/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve_all" }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      await load();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't approve.");
    } finally {
      setBusyId(null);
    }
  }

  const awaiting = pending.filter((p) => p.status === "awaiting_approval");

  if (loading) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-xs text-gray-500">Loading the queue…</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{t("pages.postQueue.title")}</h2>
          <p className="text-xs text-gray-500">
            {awaiting.length > 0 ? (
              <>
                <span className="font-medium text-amber-700">
                  {awaiting.length} post{awaiting.length === 1 ? "" : "s"} {t("pages.dashFragments.waitingForOk")}</span>{" "}
                — nothing publishes until you approve it.
              </>
            ) : pending.length > 0 ? (
              "Everything here is approved and will publish at its scheduled time."
            ) : (
              "Nothing queued. New posts appear here when your weekly plan is generated."
            )}
          </p>
        </div>
        {awaiting.length > 1 && (
          <button
            type="button"
            onClick={approveAll}
            disabled={busyId !== null}
            className="rounded-lg bg-[#0072ce] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#005fa8] disabled:opacity-60"
          >
            {busyId === "all" ? "Approving…" : `Approve all ${awaiting.length}`}
          </button>
        )}
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      )}

      {pending.length === 0 && recent.length === 0 && (
        <p className="text-xs text-gray-500">{t("pages.postQueue.empty")}</p>
      )}

      <ul className="space-y-2">
        {pending.map((item) => (
          <li
            key={item.id}
            className={`rounded-lg border p-3 ${
              item.status === "awaiting_approval"
                ? "border-amber-200 bg-amber-50/40"
                : item.status === "failed"
                  ? "border-red-200 bg-red-50/40"
                  : "border-gray-200 bg-white"
            }`}
          >
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <StatusChip status={item.status} />
              <span className="text-xs font-medium text-gray-700">
                {PLATFORM_LABEL[item.platform] ?? item.platform}
                {item.accountName ? ` — ${item.accountName}` : ""}
              </span>
              <span className="text-xs text-gray-500">{fmtWhen(item.scheduled_for, locale)}</span>
            </div>

            <p className="line-clamp-3 whitespace-pre-wrap text-xs text-gray-800">
              {item.caption}
            </p>

            {/* What the Boss found. A flag has to be actionable — show the exact
                words it objected to and what the product actually does, not a
                bare "flagged" the reader has to reverse-engineer. */}
            {item.review_verdict === "flagged" && (
              <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2">
                <p className="text-[11px] font-semibold text-amber-900">{t("pages.postQueue.heldClaim")}</p>
                <ul className="mt-1 space-y-1">
                  {(item.review_issues ?? []).map((iss, n) => (
                    <li key={n} className="text-[11px] text-amber-900">
                      {iss.quote && (
                        <span className="italic">&ldquo;{iss.quote}&rdquo;</span>
                      )}
                      {iss.quote && iss.why ? " — " : ""}
                      {iss.why}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-[10px] text-amber-700">{t("pages.postQueue.approveAnyway")}</p>
              </div>
            )}

            {item.review_verdict === "clean" && (
              <p className="mt-1.5 text-[11px] text-gray-500">
                ✓ Boss Assistant fact-checked this against what we actually ship.
                Cancel any time before it posts.
              </p>
            )}

            {item.status === "failed" && item.last_error && (
              <p className="mt-1.5 text-[11px] text-red-700">{t("pages.dashFragments.failedAfter")} {item.attempt_count} attempt
                {item.attempt_count === 1 ? "" : "s"}: {item.last_error}
              </p>
            )}

            <div className="mt-2 flex flex-wrap gap-1.5">
              {item.status === "awaiting_approval" && (
                <button
                  type="button"
                  onClick={() => act(item.id, "approve")}
                  disabled={busyId !== null}
                  className="rounded-md bg-[#0072ce] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#005fa8] disabled:opacity-60"
                >
                  {busyId === item.id ? "…" : "Approve"}
                </button>
              )}
              {item.status !== "posting" && (
                <button
                  type="button"
                  onClick={() => reschedule(item)}
                  disabled={busyId !== null}
                  className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >{t("pages.postQueue.reschedule")}</button>
              )}
              {item.status !== "posting" && (
                <button
                  type="button"
                  onClick={() => act(item.id, "cancel")}
                  disabled={busyId !== null}
                  className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                >{t("pages.postQueue.cancel")}</button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {recent.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <h3 className="mb-1.5 text-xs font-semibold text-gray-700">{t("pages.postQueue.recentlyPosted")}</h3>
          <ul className="space-y-1">
            {recent.map((item) => (
              <li key={item.id} className="flex items-center gap-2 text-[11px] text-gray-500">
                <span className="text-green-600">✓</span>
                <span className="font-medium text-gray-700">
                  {PLATFORM_LABEL[item.platform] ?? item.platform}
                </span>
                <span className="truncate">{item.caption.split("\n")[0]}</span>
                <span className="ml-auto shrink-0">
                  {item.published_at ? fmtWhen(item.published_at, locale) : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function StatusChip({ status }: { status: QueueItem["status"] }) {
  const map: Record<string, { label: string; cls: string }> = {
    awaiting_approval: { label: "Needs approval", cls: "bg-amber-100 text-amber-800" },
    scheduled: { label: "Scheduled", cls: "bg-blue-50 text-blue-700" },
    posting: { label: "Posting…", cls: "bg-blue-100 text-blue-800" },
    failed: { label: "Failed", cls: "bg-red-100 text-red-800" },
  };
  const s = map[status] ?? { label: status, cls: "bg-gray-100 text-gray-700" };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${s.cls}`}>
      {s.label}
    </span>
  );
}

/** "Mon, Jul 20, 9:00 AM" in the reader's own timezone — slots are stored UTC. */
function fmtWhen(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleString(locale, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Local YYYY-MM-DD HH:MM for the reschedule prompt. */
function fmtInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
