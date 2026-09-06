"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Reconstruct the Quick Post deep-link params from a lead_post row.
 * Only CRM-anchored triggers (new_listing / open_house / price_drop
 * / just_sold) yield a useful follow-up — synthetic triggers
 * (custom / market_update / testimonial / by_address) have no
 * subject to carry forward.
 *
 * Subjects.ts emits wire ids like `listing:<uuid>` /
 * `open_house:<uuid>` / `transaction:<uuid>` — we reconstruct that
 * format from the row's denormalized columns so /post/new picks
 * up `?trigger=…&subjectId=…` and auto-selects the subject in step 2.
 */
function reconstructFollowUpHref(post: {
  triggerKind: string | null;
  subjectKind: string | null;
  subjectRefId: string | null;
}): string | null {
  const trigger = post.triggerKind;
  if (
    trigger !== "new_listing" &&
    trigger !== "open_house" &&
    trigger !== "price_drop" &&
    trigger !== "just_sold"
  ) {
    return null;
  }
  if (!post.subjectKind || !post.subjectRefId) return null;
  const subjectId = `${post.subjectKind}:${post.subjectRefId}`;
  const params = new URLSearchParams({ trigger, subjectId });
  return `/dashboard/leads/generate/post/new?${params.toString()}`;
}

/**
 * Published-posts list — client interactions:
 *   - Per-row "Refresh metrics" button (POST /[id]/refresh)
 *   - Click-through to the external post URL
 *
 * Server-renders the initial metrics; clicking Refresh hits Meta's
 * Graph API live and re-renders the row locally without a full
 * page reload (we hold the metrics in component state).
 */

export type PublishedPostRow = {
  id: string;
  platform: string;
  caption: string;
  hashtags: string[];
  mediaLibraryId: string | null;
  thumbnailUrl: string | null;
  externalPostId: string | null;
  externalPostUrl: string | null;
  triggerKind: string | null;
  subjectKind: string | null;
  subjectRefId: string | null;
  status: string;
  errorMessage: string | null;
  metrics: Record<string, unknown>;
  metricsRefreshedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  pageName: string | null;
  igBusinessUsername: string | null;
  linkedinDisplayName: string | null;
};

type MetricsMap = Record<string, number | null>;

type RowState = {
  metrics: MetricsMap;
  metricsRefreshedAt: string | null;
  refreshing: boolean;
  refreshError: string | null;
};

export default function PostsListClient({
  posts,
}: {
  posts: PublishedPostRow[];
}) {
  const { t, i18n } = useTranslation("web_posts");
  // Track per-row metrics state so Refresh updates feel instant
  // without a full router.refresh().
  const initial = useMemo(() => {
    const map: Record<string, RowState> = {};
    for (const p of posts) {
      map[p.id] = {
        metrics: p.metrics as MetricsMap,
        metricsRefreshedAt: p.metricsRefreshedAt,
        refreshing: false,
        refreshError: null,
      };
    }
    return map;
  }, [posts]);
  const [rowState, setRowState] = useState<Record<string, RowState>>(initial);

  const refresh = useCallback(
    async (id: string) => {
      setRowState((s) => ({
        ...s,
        [id]: { ...s[id], refreshing: true, refreshError: null },
      }));
      try {
        const res = await fetch(`/api/leads-gen/posts/${id}/refresh`, {
          method: "POST",
        });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          metrics?: MetricsMap | null;
          refreshedAt?: string;
          error?: string;
        };
        if (!res.ok || !body.ok) {
          setRowState((s) => ({
            ...s,
            [id]: {
              ...s[id],
              refreshing: false,
              refreshError: body.error ?? t("card.refresh_failed"),
              // The server still stamps refreshedAt on LinkedIn 422s; reflect that.
              metricsRefreshedAt:
                body.refreshedAt ?? s[id].metricsRefreshedAt,
            },
          }));
          return;
        }
        setRowState((s) => ({
          ...s,
          [id]: {
            metrics: body.metrics ?? s[id].metrics,
            metricsRefreshedAt: body.refreshedAt ?? new Date().toISOString(),
            refreshing: false,
            refreshError: null,
          },
        }));
      } catch (e) {
        setRowState((s) => ({
          ...s,
          [id]: {
            ...s[id],
            refreshing: false,
            refreshError: e instanceof Error ? e.message : t("card.refresh_failed"),
          },
        }));
      }
    },
    [t],
  );

  if (posts.length === 0) return <EmptyState t={t} />;

  const published = posts.filter((p) => p.status === "published");
  const failed = posts.filter((p) => p.status === "failed");

  return (
    <div className="space-y-8">
      {published.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
            {t("list.section_published", { count: published.length })}
          </h2>
          <div className="space-y-3">
            {published.map((p) => (
              <PostCard
                key={p.id}
                post={p}
                state={rowState[p.id]}
                onRefresh={() => void refresh(p.id)}
                t={t}
                locale={i18n.language}
              />
            ))}
          </div>
        </section>
      )}

      {failed.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-red-700">
            {t("list.section_failed", { count: failed.length })}
          </h2>
          <div className="space-y-3">
            {failed.map((p) => (
              <PostCard
                key={p.id}
                post={p}
                state={rowState[p.id]}
                onRefresh={() => void refresh(p.id)}
                t={t}
                locale={i18n.language}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

type WebPostsT = (key: string, options?: Record<string, unknown>) => string;

function PostCard({
  post,
  state,
  onRefresh,
  t,
  locale,
}: {
  post: PublishedPostRow;
  state: RowState;
  onRefresh: () => void;
  t: WebPostsT;
  locale: string;
}) {
  const platformLabel =
    post.platform === "facebook" || post.platform === "instagram" || post.platform === "linkedin"
      ? t(`platforms.${post.platform}`)
      : post.platform;
  const platformAccent =
    post.platform === "facebook"
      ? "bg-blue-100 text-blue-700"
      : post.platform === "instagram"
        ? "bg-pink-100 text-pink-700"
        : "bg-sky-100 text-sky-700";
  const accountName =
    post.pageName ??
    post.igBusinessUsername ??
    post.linkedinDisplayName ??
    t("card.account_fallback");

  const publishedAt = post.publishedAt
    ? new Date(post.publishedAt)
    : new Date(post.createdAt);
  const longDateOpts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  };
  const shortDateOpts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  };

  return (
    <article className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
      <div className="flex gap-4">
        {post.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.thumbnailUrl}
            alt=""
            className="h-20 w-20 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-2xl">
            📝
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`rounded-full px-2 py-0.5 font-semibold ${platformAccent}`}
            >
              {platformLabel}
            </span>
            <span className="text-slate-600 dark:text-slate-400">{accountName}</span>
            <span className="text-slate-400">·</span>
            <time className="text-slate-500">
              {publishedAt.toLocaleString(locale, longDateOpts)}
            </time>
            {post.triggerKind && (
              <>
                <span className="text-slate-400">·</span>
                <span className="text-slate-500">
                  {triggerLabel(post.triggerKind, t)}
                </span>
              </>
            )}
          </div>

          <p className="line-clamp-3 whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-200">
            {post.caption}
          </p>

          {post.hashtags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {post.hashtags.slice(0, 6).map((h) => (
                <span
                  key={h}
                  className="text-xs text-slate-500"
                >
                  #{h.replace(/^#/, "")}
                </span>
              ))}
            </div>
          )}

          {post.status === "failed" && post.errorMessage && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              <strong className="block">{t("card.publish_failed_label")}</strong>
              {post.errorMessage}
            </div>
          )}

          {post.status === "published" && (
            <MetricsRow
              metrics={state.metrics}
              platform={post.platform}
              t={t}
              locale={locale}
            />
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
            {post.externalPostUrl && (
              <a
                href={post.externalPostUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-blue-700 hover:text-blue-900"
              >
                {t("card.view_on", { platform: platformLabel })}
              </a>
            )}
            {post.status === "published" && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={state.refreshing}
                className="rounded-md border border-slate-300 dark:border-slate-700 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
              >
                {state.refreshing ? t("card.refreshing") : t("card.refresh_metrics")}
              </button>
            )}
            {(() => {
              const followUpHref = reconstructFollowUpHref(post);
              if (!followUpHref) return null;
              return (
                <Link
                  href={followUpHref}
                  className="rounded-md border border-slate-300 dark:border-slate-700 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  {t("card.post_follow_up")}
                </Link>
              );
            })()}
            <span className="text-slate-400">
              {state.metricsRefreshedAt
                ? t("card.last_refresh", {
                    when: new Date(state.metricsRefreshedAt).toLocaleString(locale, shortDateOpts),
                  })
                : post.status === "published"
                  ? t("card.no_metrics")
                  : ""}
            </span>
            {state.refreshError && (
              <span className="text-red-700">{state.refreshError}</span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function MetricsRow({
  metrics,
  platform,
  t,
  locale,
}: {
  metrics: MetricsMap;
  platform: string;
  t: WebPostsT;
  locale: string;
}) {
  // Order tuned per platform — surface the most-meaningful number
  // first. FB foregrounds reach + reactions; IG foregrounds reach
  // + likes; LinkedIn (no metrics available) shows the placeholder.
  const cells: Array<{ label: string; value: number | null }> =
    platform === "instagram"
      ? [
          { label: t("metrics.likes"), value: getNum(metrics, "likes") },
          { label: t("metrics.comments"), value: getNum(metrics, "comments") },
          { label: t("metrics.saves"), value: getNum(metrics, "saves") },
          { label: t("metrics.reach"), value: getNum(metrics, "reach") },
          { label: t("metrics.impressions"), value: getNum(metrics, "impressions") },
        ]
      : platform === "facebook"
        ? [
            { label: t("metrics.reactions"), value: getNum(metrics, "likes") },
            { label: t("metrics.comments"), value: getNum(metrics, "comments") },
            { label: t("metrics.shares"), value: getNum(metrics, "shares") },
            { label: t("metrics.reach"), value: getNum(metrics, "reach") },
            { label: t("metrics.impressions"), value: getNum(metrics, "impressions") },
            { label: t("metrics.clicks"), value: getNum(metrics, "clicks") },
          ]
        : [];

  if (cells.length === 0) {
    return (
      <p className="mt-3 text-xs italic text-slate-400">{t("metrics.linkedin_note")}</p>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {cells.map((c) => (
        <span key={c.label}>
          <strong className="text-slate-900 dark:text-slate-100">
            {c.value == null ? t("metrics.empty_value") : c.value.toLocaleString(locale)}
          </strong>{" "}
          <span className="text-slate-500">{c.label}</span>
        </span>
      ))}
    </div>
  );
}

function getNum(m: Record<string, unknown>, key: string): number | null {
  const v = m[key];
  return typeof v === "number" ? v : null;
}

function triggerLabel(kind: string, t: WebPostsT): string {
  return t(`card.triggers.${kind}`, { defaultValue: kind });
}

function EmptyState({ t }: { t: WebPostsT }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-10 text-center">
      <div className="mb-2 text-3xl">📭</div>
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("empty.title")}</p>
      <p className="mt-1 text-sm text-slate-500">{t("empty.body")}</p>
    </div>
  );
}
