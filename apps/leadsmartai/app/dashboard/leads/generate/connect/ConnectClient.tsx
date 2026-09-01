"use client";

import { useCallback, useEffect, useState } from "react";
import GoogleCalendarConnectPanel from "@/components/dashboard/GoogleCalendarConnectPanel";
import {
  ConnectionNotice,
  ConnectionPill,
  connectionHealth,
} from "@/components/connections/ConnectionHealth";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";
import MetaPageSelector from "@/components/dashboard/MetaPageSelector";

/**
 * Client-side bits of the connect page:
 *   - One-shot flash message reading `?status=…&reason=…&count=…&network=…`
 *     from the OAuth callback. Dismisses on close OR after we've
 *     read it once into local state.
 *   - "Connect Facebook" / "Connect LinkedIn" links that just hit
 *     the start route.
 *   - Per-connection Disconnect button with a confirm prompt.
 *
 * The list of connections is server-rendered above by the page —
 * after a disconnect we router.refresh() to re-fetch.
 */

type MetaAccountRow = {
  id: string;
  fb_page_id: string | null;
  fb_page_name: string | null;
  ig_business_user_id: string | null;
  ig_business_username: string | null;
  account_picture_url: string | null;
  status: string;
  last_error: string | null;
  user_token_expires_at: string | null;
  connected_at: string;
};

type LinkedInAccountRow = {
  id: string;
  linkedin_member_urn: string | null;
  linkedin_member_email: string | null;
  account_display_name: string | null;
  account_picture_url: string | null;
  status: string;
  last_error: string | null;
  user_token_expires_at: string | null;
  connected_at: string;
};

type ThreadsAccountRow = {
  id: string;
  threads_user_id: string | null;
  threads_username: string | null;
  account_display_name: string | null;
  account_picture_url: string | null;
  status: string;
  last_error: string | null;
  user_token_expires_at: string | null;
  connected_at: string;
};

type PinterestAccountRow = {
  id: string;
  pinterest_username: string | null;
  pinterest_board_name: string | null;
  account_display_name: string | null;
  account_picture_url: string | null;
  status: string;
  last_error: string | null;
  user_token_expires_at: string | null;
  connected_at: string;
};

type TikTokAccountRow = {
  id: string;
  tiktok_username: string | null;
  account_display_name: string | null;
  account_picture_url: string | null;
  status: string;
  last_error: string | null;
  user_token_expires_at: string | null;
  connected_at: string;
};

type YouTubeAccountRow = {
  id: string;
  youtube_channel_title: string | null;
  account_display_name: string | null;
  account_picture_url: string | null;
  status: string;
  last_error: string | null;
  user_token_expires_at: string | null;
  connected_at: string;
};

type Network = "facebook" | "linkedin" | "threads" | "pinterest" | "tiktok" | "youtube";

type Flash =
  | { kind: "success"; title: string; body: string }
  | { kind: "cancelled"; title: string; body: string }
  | { kind: "error"; title: string; body: string };

type ConnectT = (key: string, options?: Record<string, unknown>) => string;

function networkLabel(network: string | null): string {
  if (network === "linkedin") return "LinkedIn";
  if (network === "threads") return "Threads";
  if (network === "pinterest") return "Pinterest";
  if (network === "tiktok") return "TikTok";
  if (network === "youtube") return "YouTube";
  return "Facebook";
}

function buildFlash(
  status: string | null,
  reason: string | null,
  count: string | null,
  network: string | null,
  awaiting: string | null,
  t: ConnectT,
): Flash | null {
  if (!status) return null;
  const label = networkLabel(network);
  if (status === "success") {
    const n = Number(count) || 1;
    if (network === "linkedin") {
      return {
        kind: "success",
        title: t("connect.flash.success_linkedin_title"),
        body: t("connect.flash.success_linkedin_body"),
      };
    }
    if (network === "threads") {
      return {
        kind: "success",
        title: t("connect.flash.success_threads_title"),
        body: t("connect.flash.success_threads_body"),
      };
    }
    if (network === "pinterest") {
      return {
        kind: "success",
        title: "Pinterest connected",
        body: "Your Pinterest account is connected. New Pins can be scheduled from Quick Post.",
      };
    }
    if (network === "tiktok") {
      return {
        kind: "success",
        title: "TikTok connected",
        body: "Your TikTok account is connected. Videos can be posted from Quick Post and the video ad.",
      };
    }
    if (network === "youtube") {
      return {
        kind: "success",
        title: "YouTube connected",
        body: "Your YouTube channel is connected. Videos post as Shorts from Quick Post and the video ad.",
      };
    }
    // "Linked N Pages" was a promise the old code kept by linking everything
    // it could see. Now that new Pages wait for a choice, say what actually
    // happened: found this many, none connected until you pick.
    const waiting = Number(awaiting) || 0;
    return {
      kind: "success",
      title: t("connect.flash.success_facebook_title"),
      body:
        waiting > 0
          ? t("connect.flash.success_meta_choose", { count: waiting })
          : t("connect.flash.success_meta_refreshed", { count: n }),
    };
  }
  if (status === "cancelled") {
    return {
      kind: "cancelled",
      title: t("connect.flash.cancelled_title"),
      body: reason
        ? t("connect.flash.cancelled_body_with_reason", { network: label, reason })
        : t("connect.flash.cancelled_body", { network: label }),
    };
  }
  return {
    kind: "error",
    title: t("connect.flash.error_title"),
    body: reason ?? t("connect.flash.error_body_default", { network: label }),
  };
}

export default function ConnectClient({
  initialStatus,
  initialReason,
  initialCount,
  initialNetwork,
  initialAwaiting,
  metaConnections,
  linkedinConnections,
  threadsConnections,
  pinterestConnections,
  tiktokConnections,
  youtubeConnections,
}: {
  initialStatus: string | null;
  initialReason: string | null;
  initialCount: string | null;
  initialNetwork: string | null;
  initialAwaiting: string | null;
  metaConnections: MetaAccountRow[];
  linkedinConnections: LinkedInAccountRow[];
  threadsConnections: ThreadsAccountRow[];
  pinterestConnections: PinterestAccountRow[];
  tiktokConnections: TikTokAccountRow[];
  youtubeConnections: YouTubeAccountRow[];
}) {
  const router = useRouter();
  const { t, i18n } = useTranslation("web_generate_leads_clients");
  const locale = intlLocale(i18n.language);
  const [flash, setFlash] = useState<Flash | null>(() =>
    buildFlash(initialStatus, initialReason, initialCount, initialNetwork, initialAwaiting, t),
  );
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Strip status/reason/count/network from the URL after first
  // render so a refresh doesn't re-show the flash. We do this
  // client-side to avoid a server round-trip.
  useEffect(() => {
    if (!initialStatus) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("status");
    url.searchParams.delete("reason");
    url.searchParams.delete("count");
    url.searchParams.delete("network");
    url.searchParams.delete("refreshed");
    url.searchParams.delete("awaiting");
    window.history.replaceState(null, "", url.toString());
  }, [initialStatus]);

  const onDisconnect = useCallback(
    async (network: Network, id: string, label: string) => {
      if (
        !confirm(
          t("connect.disconnect_confirm", { label, network: networkLabel(network) }),
        )
      )
        return;
      setActionError(null);
      setDisconnectingId(id);
      try {
        // Route to the platform's disconnect endpoint. Facebook connections
        // live under the Meta grant, so they use the `meta` route.
        const endpoint =
          network === "linkedin"
            ? "linkedin"
            : network === "threads"
              ? "threads"
              : network === "pinterest"
                ? "pinterest"
                : network === "tiktok"
                  ? "tiktok"
                  : network === "youtube"
                    ? "youtube"
                    : "meta";
        const res = await fetch(
          `/api/leads-gen/connect/${endpoint}/disconnect`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
          },
        );
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (!res.ok || !body.ok)
          throw new Error(body.error ?? t("connect.disconnect_failed"));
        // Refresh so the server-rendered list updates.
        router.refresh();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : t("connect.disconnect_failed"));
      } finally {
        setDisconnectingId(null);
      }
    },
    [router, t],
  );

  return (
    <div className="space-y-5">
      {flash && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm flex items-start justify-between gap-3 ${
            flash.kind === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : flash.kind === "cancelled"
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : "border-red-200 bg-red-50 text-red-900"
          }`}
        >
          <div>
            <p className="font-semibold">{flash.title}</p>
            <p className="mt-0.5">{flash.body}</p>
          </div>
          <button
            type="button"
            onClick={() => setFlash(null)}
            aria-label={t("connect.dismiss_a11y")}
            className="text-xs opacity-60 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {actionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {actionError}
        </div>
      )}

      {/* Google Calendar. It is a connected channel like any other, but its
          status only ever appeared on the Calendar page and in Settings — so
          the one screen an agent opens to answer "what am I connected to?"
          was the one screen that didn't say. Same panel, rendered here too. */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <GoogleCalendarConnectPanel />
      </section>

      {/* Meta card */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-2xl">
              📘
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                {t("connect.meta.title")}
              </h2>
              <p className="text-sm text-gray-600">
                {t("connect.meta.body")}
              </p>
            </div>
          </div>
          <a
            href="/api/leads-gen/connect/meta/start"
            className="shrink-0 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black"
          >
            {metaConnections.length > 0
              ? t("connect.meta.cta_connect_another")
              : t("connect.meta.cta_connect")}
          </a>
        </div>

        {/* Pages from the newest grant that nobody has chosen yet. Renders
            nothing when there are none. */}
        <MetaPageSelector onDone={() => router.refresh()} />

        {metaConnections.length > 0 ? (
          <ul className="mt-5 space-y-2">
            {metaConnections.map((c) => (
              <li
                key={c.id}
                className="rounded-lg border border-gray-200 bg-gray-50/40 px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  {c.account_picture_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.account_picture_url}
                      alt={c.fb_page_name ?? ""}
                      className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-gray-200"
                    />
                  ) : (
                    <div className="h-10 w-10 shrink-0 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold">
                      {(c.fb_page_name ?? "?").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {c.fb_page_name ?? t("connect.meta.page_fallback")}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {c.ig_business_username ? (
                        <>
                          <span className="rounded-full bg-pink-100 px-1.5 py-0.5 font-medium text-pink-700">
                            {t("connect.meta.ig_prefix", { user: c.ig_business_username })}
                          </span>{" "}
                          ·{" "}
                        </>
                      ) : null}
                      {t("connect.meta.page_id", { id: c.fb_page_id })}
                      {c.user_token_expires_at && (
                        <>
                          {" · "}
                          {t("connect.meta.token_expires", {
                            date: new Date(c.user_token_expires_at).toLocaleDateString(locale),
                          })}
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <ConnectionPill
                    state={connectionHealth(c.status)}
                    label={
                      c.status === "connected"
                        ? t("connect.health.connected")
                        : t("connect.health.attention")
                    }
                  />
                  <button
                    type="button"
                    onClick={() =>
                      onDisconnect(
                        "facebook",
                        c.id,
                        c.fb_page_name ?? t("connect.meta.this_page_fallback"),
                      )
                    }
                    disabled={disconnectingId === c.id}
                    className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-white disabled:opacity-50"
                  >
                    {disconnectingId === c.id
                      ? t("connect.meta.disconnect_busy")
                      : t("connect.meta.disconnect")}
                  </button>
                </div>
                </div>
                <ConnectionNotice
                  state={connectionHealth(c.status)}
                  message={c.last_error}
                  reconnectHref="/api/leads-gen/connect/meta/start"
                  reconnectLabel={t("connect.health.reconnect")}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50/60 px-3 py-3 text-sm text-gray-500">
            {t("connect.meta.empty")}
          </p>
        )}

        <p className="mt-4 text-xs text-gray-400">
          {t("connect.meta.revoke_hint_prefix")}
          <em>{t("connect.meta.revoke_hint_link")}</em>
          {t("connect.meta.revoke_hint_suffix")}
        </p>
      </section>

      {/* LinkedIn card */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-2xl">
              💼
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                {t("connect.linkedin.title")}
              </h2>
              <p className="text-sm text-gray-600">
                {t("connect.linkedin.body")}
              </p>
            </div>
          </div>
          <a
            href="/api/leads-gen/connect/linkedin/start"
            className="shrink-0 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black"
          >
            {linkedinConnections.length > 0
              ? t("connect.linkedin.cta_reconnect")
              : t("connect.linkedin.cta_connect")}
          </a>
        </div>

        {linkedinConnections.length > 0 ? (
          <ul className="mt-5 space-y-2">
            {linkedinConnections.map((c) => (
              <li
                key={c.id}
                className="rounded-lg border border-gray-200 bg-gray-50/40 px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  {c.account_picture_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.account_picture_url}
                      alt={c.account_display_name ?? ""}
                      className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-gray-200"
                    />
                  ) : (
                    <div className="h-10 w-10 shrink-0 rounded-full bg-sky-100 flex items-center justify-center text-sky-700 font-semibold">
                      {(c.account_display_name ?? "?").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {c.account_display_name ?? t("connect.linkedin.member_fallback")}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {c.linkedin_member_email ? (
                        <>{c.linkedin_member_email}</>
                      ) : (
                        <>{t("connect.linkedin.personal_feed")}</>
                      )}
                      {c.user_token_expires_at && (
                        <>
                          {" · "}
                          {t("connect.meta.token_expires", {
                            date: new Date(c.user_token_expires_at).toLocaleDateString(locale),
                          })}
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <ConnectionPill
                    state={connectionHealth(c.status)}
                    label={
                      c.status === "connected"
                        ? t("connect.health.connected")
                        : t("connect.health.attention")
                    }
                  />
                  <button
                    type="button"
                    onClick={() =>
                      onDisconnect(
                        "linkedin",
                        c.id,
                        c.account_display_name ?? t("connect.linkedin.your_linkedin_fallback"),
                      )
                    }
                    disabled={disconnectingId === c.id}
                    className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-white disabled:opacity-50"
                  >
                    {disconnectingId === c.id
                      ? t("connect.meta.disconnect_busy")
                      : t("connect.meta.disconnect")}
                  </button>
                </div>
                </div>
                <ConnectionNotice
                  state={connectionHealth(c.status)}
                  message={c.last_error}
                  reconnectHref="/api/leads-gen/connect/linkedin/start"
                  reconnectLabel={t("connect.health.reconnect")}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50/60 px-3 py-3 text-sm text-gray-500">
            {t("connect.linkedin.empty")}
          </p>
        )}

        <p className="mt-4 text-xs text-gray-400">
          {t("connect.linkedin.revoke_hint_prefix")}
          <em>{t("connect.linkedin.revoke_hint_link")}</em>
          {t("connect.linkedin.revoke_hint_suffix")}
        </p>
      </section>

      {/* Threads card */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-900 text-2xl text-white">
              @
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                {t("connect.threads.title")}
              </h2>
              <p className="text-sm text-gray-600">
                {t("connect.threads.body")}
              </p>
            </div>
          </div>
          <a
            href="/api/leads-gen/connect/threads/start"
            className="shrink-0 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black"
          >
            {threadsConnections.length > 0
              ? t("connect.threads.cta_reconnect")
              : t("connect.threads.cta_connect")}
          </a>
        </div>

        {threadsConnections.length > 0 ? (
          <ul className="mt-5 space-y-2">
            {threadsConnections.map((c) => (
              <li
                key={c.id}
                className="rounded-lg border border-gray-200 bg-gray-50/40 px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  {c.account_picture_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.account_picture_url}
                      alt={c.account_display_name ?? ""}
                      className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-gray-200"
                    />
                  ) : (
                    <div className="h-10 w-10 shrink-0 rounded-full bg-gray-900 flex items-center justify-center text-white font-semibold">
                      {(c.account_display_name ?? c.threads_username ?? "?")
                        .slice(0, 1)
                        .toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {c.account_display_name ??
                        c.threads_username ??
                        t("connect.threads.member_fallback")}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {c.threads_username
                        ? t("connect.threads.handle", { user: c.threads_username })
                        : t("connect.threads.member_fallback")}
                      {c.user_token_expires_at && (
                        <>
                          {" · "}
                          {t("connect.meta.token_expires", {
                            date: new Date(c.user_token_expires_at).toLocaleDateString(locale),
                          })}
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <ConnectionPill
                    state={connectionHealth(c.status)}
                    label={
                      c.status === "connected"
                        ? t("connect.health.connected")
                        : t("connect.health.attention")
                    }
                  />
                  <button
                    type="button"
                    onClick={() =>
                      onDisconnect(
                        "threads",
                        c.id,
                        c.account_display_name ??
                          c.threads_username ??
                          t("connect.threads.your_threads_fallback"),
                      )
                    }
                    disabled={disconnectingId === c.id}
                    className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-white disabled:opacity-50"
                  >
                    {disconnectingId === c.id
                      ? t("connect.meta.disconnect_busy")
                      : t("connect.meta.disconnect")}
                  </button>
                </div>
                </div>
                <ConnectionNotice
                  state={connectionHealth(c.status)}
                  message={c.last_error}
                  reconnectHref="/api/leads-gen/connect/threads/start"
                  reconnectLabel={t("connect.health.reconnect")}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50/60 px-3 py-3 text-sm text-gray-500">
            {t("connect.threads.empty")}
          </p>
        )}

        <p className="mt-4 text-xs text-gray-400">
          {t("connect.threads.revoke_hint")}
        </p>
      </section>

      {/* Pinterest card */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E60023] text-2xl font-bold text-white">
              P
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Pinterest</h2>
              <p className="text-sm text-gray-600">{t("connect.pinterest.body")}</p>
            </div>
          </div>
          <a
            href="/api/leads-gen/connect/pinterest/start"
            className="shrink-0 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black"
          >
            {pinterestConnections.length > 0 ? t("connect.pinterest.cta_reconnect") : t("connect.pinterest.cta_connect")}
          </a>
        </div>

        {pinterestConnections.length > 0 ? (
          <ul className="mt-5 space-y-2">
            {pinterestConnections.map((c) => (
              <li
                key={c.id}
                className="rounded-lg border border-gray-200 bg-gray-50/40 px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  {c.account_picture_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.account_picture_url}
                      alt={c.account_display_name ?? ""}
                      className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-gray-200"
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E60023] font-semibold text-white">
                      {(c.account_display_name ?? c.pinterest_username ?? "?").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {c.account_display_name ?? c.pinterest_username ?? t("dashboard:pages.connect.pinterestAccount")}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {c.pinterest_username ? `@${c.pinterest_username}` : "Pinterest"}
                      {c.pinterest_board_name ? ` · board: ${c.pinterest_board_name}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <ConnectionPill
                    state={connectionHealth(c.status)}
                    label={
                      c.status === "connected"
                        ? t("connect.health.connected")
                        : t("connect.health.attention")
                    }
                  />
                  <button
                    type="button"
                    onClick={() =>
                      onDisconnect(
                        "pinterest",
                        c.id,
                        c.account_display_name ?? c.pinterest_username ?? "your Pinterest",
                      )
                    }
                    disabled={disconnectingId === c.id}
                    className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-white disabled:opacity-50"
                  >
                    {disconnectingId === c.id
                      ? t("connect.meta.disconnect_busy")
                      : t("connect.meta.disconnect")}
                  </button>
                </div>
                </div>
                <ConnectionNotice
                  state={connectionHealth(c.status)}
                  message={c.last_error}
                  reconnectHref="/api/leads-gen/connect/pinterest/start"
                  reconnectLabel={t("connect.health.reconnect")}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50/60 px-3 py-3 text-sm text-gray-500">{t("connect.pinterest.empty")}</p>
        )}

        <p className="mt-4 text-xs text-gray-400">{t("connect.pinterest.revoke_hint")}</p>
      </section>

      {/* TikTok card */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-black text-2xl font-bold text-white">
              t
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">TikTok</h2>
              <p className="text-sm text-gray-600">{t("connect.tiktok.body")}</p>
            </div>
          </div>
          <a
            href="/api/leads-gen/connect/tiktok/start"
            className="shrink-0 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black"
          >
            {tiktokConnections.length > 0 ? t("connect.tiktok.cta_reconnect") : t("connect.tiktok.cta_connect")}
          </a>
        </div>

        {tiktokConnections.length > 0 ? (
          <ul className="mt-5 space-y-2">
            {tiktokConnections.map((c) => (
              <li
                key={c.id}
                className="rounded-lg border border-gray-200 bg-gray-50/40 px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  {c.account_picture_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.account_picture_url}
                      alt={c.account_display_name ?? ""}
                      className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-gray-200"
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black font-semibold text-white">
                      {(c.account_display_name ?? c.tiktok_username ?? "?").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {c.account_display_name ?? c.tiktok_username ?? t("dashboard:pages.connect.tiktokAccount")}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {c.tiktok_username ? `@${c.tiktok_username}` : "TikTok"}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <ConnectionPill
                    state={connectionHealth(c.status)}
                    label={
                      c.status === "connected"
                        ? t("connect.health.connected")
                        : t("connect.health.attention")
                    }
                  />
                  <button
                    type="button"
                    onClick={() =>
                      onDisconnect(
                        "tiktok",
                        c.id,
                        c.account_display_name ?? c.tiktok_username ?? "your TikTok",
                      )
                    }
                    disabled={disconnectingId === c.id}
                    className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-white disabled:opacity-50"
                  >
                    {disconnectingId === c.id
                      ? t("connect.meta.disconnect_busy")
                      : t("connect.meta.disconnect")}
                  </button>
                </div>
                </div>
                <ConnectionNotice
                  state={connectionHealth(c.status)}
                  message={c.last_error}
                  reconnectHref="/api/leads-gen/connect/tiktok/start"
                  reconnectLabel={t("connect.health.reconnect")}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50/60 px-3 py-3 text-sm text-gray-500">{t("connect.tiktok.empty")}</p>
        )}

        <p className="mt-4 text-xs text-gray-400">{t("connect.tiktok.revoke_hint")}</p>
      </section>

      {/* YouTube card */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF0000] text-2xl font-bold text-white">
              ▶
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">YouTube</h2>
              <p className="text-sm text-gray-600">{t("connect.youtube.body")}</p>
            </div>
          </div>
          <a
            href="/api/leads-gen/connect/youtube/start"
            className="shrink-0 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black"
          >
            {youtubeConnections.length > 0 ? t("connect.youtube.cta_reconnect") : t("connect.youtube.cta_connect")}
          </a>
        </div>

        {youtubeConnections.length > 0 ? (
          <ul className="mt-5 space-y-2">
            {youtubeConnections.map((c) => (
              <li
                key={c.id}
                className="rounded-lg border border-gray-200 bg-gray-50/40 px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  {c.account_picture_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.account_picture_url}
                      alt={c.account_display_name ?? ""}
                      className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-gray-200"
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FF0000] font-semibold text-white">
                      {(c.account_display_name ?? c.youtube_channel_title ?? "?").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {c.account_display_name ?? c.youtube_channel_title ?? t("dashboard:pages.connect.youtubeChannel")}
                    </p>
                    <p className="truncate text-xs text-gray-500">{t("youtubeChannel")}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <ConnectionPill
                    state={connectionHealth(c.status)}
                    label={
                      c.status === "connected"
                        ? t("connect.health.connected")
                        : t("connect.health.attention")
                    }
                  />
                  <button
                    type="button"
                    onClick={() =>
                      onDisconnect(
                        "youtube",
                        c.id,
                        c.account_display_name ?? c.youtube_channel_title ?? "your YouTube",
                      )
                    }
                    disabled={disconnectingId === c.id}
                    className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-white disabled:opacity-50"
                  >
                    {disconnectingId === c.id
                      ? t("connect.meta.disconnect_busy")
                      : t("connect.meta.disconnect")}
                  </button>
                </div>
                </div>
                <ConnectionNotice
                  state={connectionHealth(c.status)}
                  message={c.last_error}
                  reconnectHref="/api/leads-gen/connect/youtube/start"
                  reconnectLabel={t("connect.health.reconnect")}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50/60 px-3 py-3 text-sm text-gray-500">{t("connect.youtube.empty")}</p>
        )}

        <p className="mt-4 text-xs text-gray-400">{t("connect.youtube.revoke_hint")}</p>
      </section>

      {/* Phase 3 placeholders */}
      <section className="rounded-2xl border border-dashed border-gray-300 bg-gray-50/40 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-2xl">
            🔍
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-700">
              {t("connect.google_ads.title")}{" "}
              <span className="ml-1 rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
                {t("connect.google_ads.phase_badge")}
              </span>
            </h2>
            <p className="text-sm text-gray-500">
              {t("connect.google_ads.body")}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
