"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Bell, CheckCheck, FileText, MessageSquare, Phone, Calendar, Zap } from "lucide-react";
import { markNotificationsRead } from "@/lib/actions/notifications";
import { createBrowserClient } from "@supabase/ssr";
import { browserConnForHost } from "@/lib/pack-host";
import Link from "next/link";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
  /** Set on rows written after notifications carried keys; see lib/actions/notifications.ts. */
  title_key?: string | null;
  body_key?: string | null;
  params?: Record<string, string | number> | null;
}

/**
 * What this notification says, in the reader's language.
 *
 * A row written with a key is rendered from that key now, when we finally
 * know who is reading. A row without one — every row written before keys
 * existed — falls back to the English sentence stored with it, which is the
 * whole reason `title` is still NOT NULL.
 *
 * `defaultValue` makes the fallback survive a third case too: a key that ships
 * in one bundle and not another renders the stored English instead of a raw
 * `notifications.events.invoicePaid` path.
 *
 * Keys live in the `home` namespace this component already binds, beside the
 * bell's own chrome — `notifications.events.*`. A separate namespace would
 * have split one small surface across two files for no reader's benefit.
 */
function line(
  t: TFunction,
  key: string | null | undefined,
  stored: string | null,
  params: Record<string, string | number> | null | undefined,
): string | null {
  if (key) return t(key, { defaultValue: stored ?? key, ...(params ?? {}) });
  return stored;
}

interface Props {
  orgId: string;
  initialCount: number;
  initialNotifications: Notification[];
}

const TYPE_ICON: Record<string, React.ElementType> = {
  invoice_paid:    FileText,
  invoice_overdue: FileText,
  new_message:     MessageSquare,
  missed_call:     Phone,
  booking:         Calendar,
  system:          Zap,
};

const TYPE_COLOR: Record<string, string> = {
  invoice_paid:    "text-emerald-600 bg-emerald-50",
  invoice_overdue: "text-rose-600 bg-rose-50",
  new_message:     "text-indigo-600 bg-indigo-50",
  missed_call:     "text-amber-600 bg-amber-50",
  booking:         "text-emerald-600 bg-emerald-50",
  system:          "text-slate-600 bg-slate-100",
};

/** "3m" / "3 分钟前" — the unit is copy, so the translator has to come in. */
function timeAgo(iso: string, t: TFunction<"home">) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return t("notifications.ago.justNow");
  if (m < 60) return t("notifications.ago.minutes", { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("notifications.ago.hours", { count: h });
  return t("notifications.ago.days", { count: Math.floor(h / 24) });
}

export function NotificationsBell({ orgId, initialCount, initialNotifications }: Props) {
  const { t }                 = useTranslation("home");
  const [open, setOpen]       = useState(false);
  const [count, setCount]     = useState(initialCount);
  const [notifs, setNotifs]   = useState(initialNotifications);
  const [isPending, start]    = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // Supabase Realtime — push new notifications in without page reload
  useEffect(() => {
    const conn = browserConnForHost(window.location.host);
    const supabase = createBrowserClient(conn.url, conn.key);

    const channel = supabase
      .channel("notifications-bell")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `organization_id=eq.${orgId}` },
        (payload) => {
          const n = payload.new as Notification;
          setNotifs((prev) => [n, ...prev].slice(0, 20));
          setCount((c) => c + 1);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  function handleOpen() {
    setOpen((v) => !v);
    if (!open && count > 0) {
      // Mark all read optimistically
      setCount(0);
      setNotifs((n) => n.map((item) => ({ ...item, read: true })));
      start(() => markNotificationsRead());
    }
  }

  const unread = notifs.filter((n) => !n.read);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleOpen}
        className={`relative flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
          open ? "bg-slate-700" : "hover:bg-slate-800"
        }`}
        title={t("notifications.title")}
      >
        <Bell className="w-4 h-4 text-slate-400" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-indigo-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-full ml-2 top-0 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">{t("notifications.title")}</h3>
            {unread.length === 0 && (
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <CheckCheck className="w-3.5 h-3.5" /> {t("notifications.allCaughtUp")}
              </span>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center px-6">
                <Bell className="w-7 h-7 text-slate-300 mb-2" />
                <p className="text-xs text-slate-400">{t("notifications.empty")}</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {notifs.map((n) => {
                  const Icon  = TYPE_ICON[n.type] ?? Zap;
                  const color = TYPE_COLOR[n.type] ?? TYPE_COLOR.system;
                  const inner = (
                    <div className={`flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors ${!n.read ? "bg-indigo-50/40" : ""}`}>
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${color}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium text-slate-800 leading-snug ${!n.read ? "font-semibold" : ""}`}>
                          {line(t, n.title_key, n.title, n.params)}
                        </p>
                        {line(t, n.body_key, n.body, n.params) && (
                          <p className="text-xs text-slate-500 mt-0.5 truncate">
                            {line(t, n.body_key, n.body, n.params)}
                          </p>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 flex-shrink-0 mt-0.5">{timeAgo(n.created_at, t)}</span>
                    </div>
                  );

                  return n.link ? (
                    <Link key={n.id} href={n.link} onClick={() => setOpen(false)}>
                      {inner}
                    </Link>
                  ) : (
                    <div key={n.id}>{inner}</div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
