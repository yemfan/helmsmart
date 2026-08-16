"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Listing-side surface — agent picks a connected Page, reviews the
 * caption (auto-built from transaction fields, editable inline),
 * optionally adds a link, and posts. Success surfaces a flash + a
 * direct link to the post on Facebook.
 *
 * No connections → card directs to /dashboard/settings to authorize
 * one. We never silently link out to the OAuth start route from here
 * because the agent's expectation is "post NOW," not "auth + post."
 */

type Connection = {
  id: string;
  providerAccountId: string;
  providerAccountName: string | null;
};

type PostState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; postId: string; pageName: string | null }
  | { kind: "error"; message: string };

export default function PostToFacebookCard({
  transactionId,
  defaultLink,
}: {
  transactionId: string;
  /** Optional pre-filled link (e.g. listing URL on the marketing site). */
  defaultLink?: string | null;
}) {
  const { t } = useTranslation("dashboard");
  const [open, setOpen] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loadingConns, setLoadingConns] = useState(true);
  const [connectionId, setConnectionId] = useState<string>("");
  const [hook, setHook] = useState("");
  const [link, setLink] = useState(defaultLink ?? "");
  const [captionPreview, setCaptionPreview] = useState<string | null>(null);
  const [postState, setPostState] = useState<PostState>({ kind: "idle" });

  const loadConnections = useCallback(async () => {
    setLoadingConns(true);
    try {
      const res = await fetch("/api/dashboard/social/connections", {
        cache: "no-store",
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        connections?: Connection[];
      };
      if (data.ok && Array.isArray(data.connections)) {
        setConnections(data.connections);
        if (data.connections.length > 0 && !connectionId) {
          setConnectionId(data.connections[0].id);
        }
      }
    } finally {
      setLoadingConns(false);
    }
  }, [connectionId]);

  useEffect(() => {
    if (open) void loadConnections();
  }, [open, loadConnections]);

  const onSubmit = useCallback(async () => {
    if (!connectionId) return;
    setPostState({ kind: "submitting" });
    try {
      const res = await fetch(
        `/api/dashboard/transactions/${encodeURIComponent(transactionId)}/post-to-facebook`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            connectionId,
            hook: hook.trim() || undefined,
            link: link.trim() || undefined,
            captionOverride: captionPreview ?? undefined,
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        postId?: string;
        pageName?: string | null;
        caption?: string;
        error?: string;
      };
      if (!res.ok || data.ok === false) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setPostState({
        kind: "success",
        postId: data.postId ?? "",
        pageName: data.pageName ?? null,
      });
      // Update the preview to show what actually went out (in case
      // the server rendered a different caption than the editor).
      if (data.caption) setCaptionPreview(data.caption);
    } catch (e) {
      setPostState({
        kind: "error",
        message: e instanceof Error ? e.message : "Failed to post",
      });
    }
  }, [connectionId, transactionId, hook, link, captionPreview]);

  const onClose = useCallback(() => {
    setOpen(false);
    // Reset transient state so the next open is clean.
    setTimeout(() => {
      setPostState({ kind: "idle" });
      setCaptionPreview(null);
      setHook("");
    }, 200);
  }, []);

  const fbPostUrl = useMemo(() => {
    if (postState.kind !== "success" || !postState.postId) return null;
    // FB post id format is `<pageId>_<postId>` — we link to a generic
    // permalink that resolves both halves.
    const id = postState.postId;
    return `https://www.facebook.com/${id.replace("_", "/posts/")}`;
  }, [postState]);

  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              📣 Post to Facebook
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">{t("pages.postToFacebook.intro")}</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-lg bg-[#1877F2] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#155FC4]"
          >{t("pages.postToFacebook.compose")}</button>
        </div>
      </div>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-base font-semibold text-slate-900">{t("pages.postToFacebook.postListing")}</h2>

            {loadingConns ? (
              <div className="mt-4 h-20 animate-pulse rounded-lg bg-slate-100" />
            ) : connections.length === 0 ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                No Pages connected yet.{" "}
                <Link
                  href="/dashboard/settings?tab=channels"
                  className="font-semibold text-amber-800 underline"
                >{t("pages.postToFacebook.connectPage")}</Link>{" "}
                to start posting.
              </div>
            ) : postState.kind === "success" ? (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-6 text-center">
                <p className="text-sm font-semibold text-emerald-800">{t("pages.postToFacebook.posted")}</p>
                <p className="mt-1 text-xs text-emerald-700">
                  Live on {postState.pageName ?? "your Page"}.
                </p>
                <div className="mt-4 flex justify-center gap-2">
                  {fbPostUrl ? (
                    <a
                      href={fbPostUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                    >
                      View on Facebook ↗
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                  >{t("pages.postToFacebook.done")}</button>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-700">{t("pages.postToFacebook.page")}</span>
                  <select
                    value={connectionId}
                    onChange={(e) => setConnectionId(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  >
                    {connections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.providerAccountName ?? c.providerAccountId}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-slate-700">{t("pages.postToFacebook.hook")}<span className="font-normal text-slate-400">(optional)</span>
                  </span>
                  <input
                    type="text"
                    value={hook}
                    onChange={(e) => setHook(e.target.value)}
                    placeholder={t("pages.postToFacebook.hookPlaceholder")}
                    className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  />
                  <span className="mt-1 block text-[10px] text-slate-400">{t("pages.postToFacebook.hookHint")}</span>
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-slate-700">{t("pages.postToFacebook.link")}<span className="font-normal text-slate-400">(optional)</span>
                  </span>
                  <input
                    type="url"
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    placeholder="https://your-marketing-site.com/listing/..."
                    className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  />
                  <span className="mt-1 block text-[10px] text-slate-400">{t("pages.postToFacebook.linkHint")}</span>
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-slate-700">
                    Caption{" "}
                    <span className="font-normal text-slate-400">
                      (auto-built, editable)
                    </span>
                  </span>
                  <textarea
                    value={captionPreview ?? ""}
                    onChange={(e) => setCaptionPreview(e.target.value)}
                    rows={6}
                    placeholder={t("pages.postToFacebook.captionPlaceholder")}
                    className="mt-1 block w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  />
                </label>

                {postState.kind === "error" ? (
                  <p className="text-xs text-rose-600">{postState.message}</p>
                ) : null}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={postState.kind === "submitting"}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >{t("pages.postToFacebook.cancel")}</button>
                  <button
                    type="button"
                    onClick={onSubmit}
                    disabled={postState.kind === "submitting" || !connectionId}
                    className="rounded-lg bg-[#1877F2] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#155FC4] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {postState.kind === "submitting" ? "Posting…" : "Post"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
