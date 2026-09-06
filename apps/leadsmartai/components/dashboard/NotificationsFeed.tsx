"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bell, CheckCheck, Flame, PhoneMissed, Sparkles, UserPlus } from "lucide-react";
import type { MobileAgentInboxNotificationDto } from "@leadsmart/shared";
import { intlLocale } from "@/lib/i18n/locale";

/** Fired after a read-state change so the top-bar bell can refetch its count. */
export const NOTIFICATIONS_READ_EVENT = "cb:notifications-read";

type Item = MobileAgentInboxNotificationDto;

/** Where a notification takes you on the web. Mirrors the mobile deep-link screens. */
function hrefFor(n: Item): string {
  const link = n.data?.deep_link;
  const contactId = link?.contact_id ? String(link.contact_id) : null;
  switch (link?.screen) {
    case "lead":
      return contactId ? `/dashboard/leads?id=${encodeURIComponent(contactId)}` : "/dashboard/contacts";
    case "call_log":
      return "/dashboard/calls";
    case "task":
      return "/dashboard/tasks";
    default:
      if (n.type === "missed_call") return "/dashboard/calls";
      if (contactId) return `/dashboard/leads?id=${encodeURIComponent(contactId)}`;
      return "/dashboard";
  }
}

function TypeIcon({ type }: { type: Item["type"] | string }) {
  const cls = "h-4 w-4";
  switch (type) {
    case "hot_lead":
      return <Flame className={cls} strokeWidth={2} aria-hidden />;
    case "missed_call":
      return <PhoneMissed className={cls} strokeWidth={2} aria-hidden />;
    case "new_lead":
      return <UserPlus className={cls} strokeWidth={2} aria-hidden />;
    case "avatar_ready":
      return <Sparkles className={cls} strokeWidth={2} aria-hidden />;
    default:
      return <Bell className={cls} strokeWidth={2} aria-hidden />;
  }
}

const TYPE_TONE: Record<string, string> = {
  hot_lead: "bg-orange-100 text-orange-700",
  missed_call: "bg-rose-100 text-rose-700",
  reminder: "bg-sky-100 text-sky-800",
  new_lead: "bg-emerald-100 text-emerald-700",
  avatar_ready: "bg-violet-100 text-violet-700",
};

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * One feed, newest first, grouped by day, with a read state — replacing three
 * columns that ignored the same table the bell counted (434 unread and no way
 * to clear them, per the 2026-09 UX audit).
 */
export function NotificationsFeed({ initial }: { initial: Item[] }) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const router = useRouter();
  const [items, setItems] = useState<Item[]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unread = items.filter((n) => !n.read).length;

  const groups = useMemo(() => {
    const today = dayKey(new Date().toISOString());
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const yesterday = dayKey(y.toISOString());
    const map = new Map<string, { label: string; items: Item[] }>();
    for (const n of items) {
      const k = dayKey(n.created_at);
      if (!map.has(k)) {
        const label =
          k === today
            ? t("notifications.feed.today")
            : k === yesterday
              ? t("notifications.feed.yesterday")
              : new Date(n.created_at).toLocaleDateString(locale, { weekday: "long", month: "short", day: "numeric" });
        map.set(k, { label, items: [] });
      }
      map.get(k)!.items.push(n);
    }
    return Array.from(map.values());
  }, [items, locale, t]);

  function announceRead() {
    try {
      window.dispatchEvent(new Event(NOTIFICATIONS_READ_EVENT));
    } catch {
      /* ignore */
    }
  }

  async function markAllRead() {
    if (busy || unread === 0) return;
    setBusy(true);
    setError(null);
    const prev = items;
    setItems((cur) => cur.map((n) => ({ ...n, read: true })));
    try {
      const res = await fetch("/api/dashboard/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.error ?? t("notifications.feed.markFailed"));
      announceRead();
    } catch (e) {
      // Never leave the list showing a state the database does not hold.
      setItems(prev);
      setError(e instanceof Error ? e.message : t("notifications.feed.markFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function open(n: Item) {
    const href = hrefFor(n);
    if (!n.read) {
      setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      void fetch("/api/dashboard/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId: n.id, read: true }),
      })
        .then(() => announceRead())
        .catch(() => {
          setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, read: false } : x)));
        });
    }
    router.push(href);
  }

  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-900/[0.03]">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <p className="text-sm text-slate-600">
          {unread > 0 ? t("notifications.feed.unreadCount", { count: unread }) : t("notifications.feed.allCaughtUp")}
        </p>
        <button
          type="button"
          onClick={() => void markAllRead()}
          disabled={busy || unread === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          <CheckCheck className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          {busy ? t("notifications.feed.marking") : t("notifications.feed.markAllRead")}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mx-4 mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      ) : null}

      {items.length === 0 ? (
        <p className="px-4 py-12 text-center text-sm text-slate-500">{t("notifications.feed.empty")}</p>
      ) : (
        groups.map((g) => (
          <div key={g.label}>
            <p className="bg-slate-50/80 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{g.label}</p>
            <ul className="divide-y divide-slate-100">
              {g.items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => void open(n)}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-50 ${n.read ? "" : "bg-blue-50/40"}`}
                  >
                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${TYPE_TONE[n.type] ?? "bg-slate-100 text-slate-600"}`}>
                      <TypeIcon type={n.type} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className={`truncate text-sm ${n.read ? "font-medium text-slate-700" : "font-semibold text-slate-900"}`}>{n.title}</span>
                        {!n.read ? <span className="h-2 w-2 shrink-0 rounded-full bg-[#0072ce]" aria-label={t("notifications.feed.unread")} /> : null}
                      </span>
                      {n.body ? <span className="mt-0.5 line-clamp-2 block text-xs text-slate-600">{n.body}</span> : null}
                      <span className="mt-1 block text-[11px] text-slate-400">
                        {new Date(n.created_at).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })}
                        {" · "}
                        {t(`notifications.feed.types.${n.type}`, { defaultValue: n.type })}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
