"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { NOTIFICATIONS_READ_EVENT } from "@/components/dashboard/NotificationsFeed";

/**
 * Notifications bell with an unread badge — the constitution's
 * notification philosophy means a lit badge actually signals something
 * (revenue opportunity, risk, action required, deadline), so it's
 * worth glancing at.
 */
export function NotificationsBell({ className }: { className?: string }) {
  const [unread, setUnread] = useState(0);

  const load = useCallback(() => {
    fetch("/api/dashboard/notifications/unread")
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok) setUnread(Number(j.count) || 0);
      })
      .catch(() => {});
  }, []);

  // The bell lives in the persistent top bar, so it never remounts. Refetch
  // when the feed clears things and when the tab regains focus.
  useEffect(() => {
    load();
    window.addEventListener(NOTIFICATIONS_READ_EVENT, load);
    window.addEventListener("focus", load);
    return () => {
      window.removeEventListener(NOTIFICATIONS_READ_EVENT, load);
      window.removeEventListener("focus", load);
    };
  }, [load]);

  return (
    <Link
      href="/dashboard/notifications"
      className={
        className ??
        "relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200/90 bg-white text-slate-600 shadow-sm ring-1 ring-slate-900/[0.03] transition hover:border-slate-300 hover:bg-slate-50"
      }
      aria-label={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
    >
      <BellRing className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
      {unread > 0 && (
        <span
          // red-600 on white clears AA for the tiny digits; red-500 did not.
          className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white tabular-nums"
          aria-hidden
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
