import type { Metadata } from "next";
import Link from "next/link";

import { getCurrentAgentContext } from "@/lib/dashboardService";
import { getServerT } from "@/lib/i18n/server";
import {
  LEAD_MEDIA_BUCKET,
  SIGNED_URL_TTL_SECONDS,
} from "@/lib/leads-gen/media";
import { getTopPosts } from "@/lib/leads-gen/top-posts";
import { supabaseAdmin } from "@/lib/supabase/admin";

import PostsListClient, { type PublishedPostRow } from "./PostsListClient";
import TopPerformersStrip from "./TopPerformersStrip";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("metadata.title", { ns: "web_posts" }),
    description: t("metadata.description", { ns: "web_posts" }),
    robots: { index: false },
  };
}

/**
 * Published-posts dashboard. Server-renders the agent's
 * `lead_posts` rows (status='published' first, plus the most
 * recent failures for forensic) with attached image thumbnails
 * resolved as signed URLs.
 *
 * Engagement metrics (`metrics` jsonb) come straight from the row
 * — the client component has a per-row "Refresh metrics" button
 * that hits /api/leads-gen/posts/[id]/refresh and re-renders.
 */
export default async function PublishedPostsPage() {
  const { agentId } = await getCurrentAgentContext();
  const t = await getServerT();

  // Top performers — separate query so it shares the page's data
  // budget but stays decoupled from the main list rendering.
  // Hides itself entirely when no metrics are populated yet
  // (see TopPerformersStrip + getTopPosts.hasMetrics).
  const top = await getTopPosts({
    agentId: String(agentId),
    limit: 3,
    windowDays: 14,
  }).catch(() => ({ items: [], windowDays: 14, hasMetrics: false }));

  const { data, error } = await supabaseAdmin
    .from("lead_posts")
    .select(
      "id, social_account_id, platform, caption, hashtags, media_library_id, external_post_id, external_post_url, trigger_kind, subject_kind, subject_ref_id, status, error_message, metrics, metrics_refreshed_at, published_at, created_at",
    )
    .eq("agent_id", String(agentId))
    .in("status", ["published", "failed"])
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6">
        <p className="text-sm text-red-700">
          {t("page.error_prefix", { ns: "web_posts", message: error.message })}
        </p>
      </div>
    );
  }

  type DbRow = {
    id: string;
    social_account_id: string;
    platform: string;
    caption: string;
    hashtags: string[] | null;
    media_library_id: string | null;
    external_post_id: string | null;
    external_post_url: string | null;
    trigger_kind: string | null;
    subject_kind: string | null;
    subject_ref_id: string | null;
    status: string;
    error_message: string | null;
    metrics: Record<string, unknown> | null;
    metrics_refreshed_at: string | null;
    published_at: string | null;
    created_at: string;
  };
  const rows = (data as DbRow[] | null) ?? [];

  // Connection display names — one batched lookup keyed by id.
  const socialAccountIds = Array.from(
    new Set(rows.map((r) => r.social_account_id)),
  );
  let displayByAccount = new Map<
    string,
    {
      fbPageName: string | null;
      igUsername: string | null;
      linkedinName: string | null;
    }
  >();
  if (socialAccountIds.length > 0) {
    const { data: connRows } = await supabaseAdmin
      .from("social_accounts")
      .select(
        "id, platform, fb_page_name, ig_business_username, account_display_name",
      )
      .in("id", socialAccountIds);
    displayByAccount = new Map(
      ((connRows as Array<{
        id: string;
        platform: string;
        fb_page_name: string | null;
        ig_business_username: string | null;
        account_display_name: string | null;
      }> | null) ?? []).map((r) => [
        r.id,
        {
          fbPageName: r.fb_page_name,
          igUsername: r.ig_business_username,
          linkedinName:
            r.platform === "linkedin" ? r.account_display_name : null,
        },
      ]),
    );
  }

  // Thumbnail signed URLs — single bulk call keyed by media_library.id.
  const mediaIds = Array.from(
    new Set(
      rows
        .map((r) => r.media_library_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const thumbByMediaId = new Map<string, string | null>();
  if (mediaIds.length > 0) {
    const { data: mediaRows } = await supabaseAdmin
      .from("media_library")
      .select("id, storage_path")
      .in("id", mediaIds);
    const rowsArr = (mediaRows as Array<{
      id: string;
      storage_path: string;
    }> | null) ?? [];
    if (rowsArr.length > 0) {
      const paths = rowsArr.map((r) => r.storage_path);
      const { data: signedData } = await supabaseAdmin.storage
        .from(LEAD_MEDIA_BUCKET)
        .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
      const signedByPath = new Map<string, string>();
      for (const s of signedData ?? []) {
        if (s.path && s.signedUrl) signedByPath.set(s.path, s.signedUrl);
      }
      for (const m of rowsArr) {
        thumbByMediaId.set(m.id, signedByPath.get(m.storage_path) ?? null);
      }
    }
  }

  const posts: PublishedPostRow[] = rows.map((r) => {
    const display = displayByAccount.get(r.social_account_id) ?? null;
    return {
      id: r.id,
      platform: r.platform,
      caption: r.caption,
      hashtags: r.hashtags ?? [],
      mediaLibraryId: r.media_library_id,
      thumbnailUrl: r.media_library_id
        ? thumbByMediaId.get(r.media_library_id) ?? null
        : null,
      externalPostId: r.external_post_id,
      externalPostUrl: r.external_post_url,
      triggerKind: r.trigger_kind,
      subjectKind: r.subject_kind,
      subjectRefId: r.subject_ref_id,
      status: r.status,
      errorMessage: r.error_message,
      metrics: r.metrics ?? {},
      metricsRefreshedAt: r.metrics_refreshed_at,
      publishedAt: r.published_at,
      createdAt: r.created_at,
      pageName: display?.fbPageName ?? null,
      igBusinessUsername: display?.igUsername ?? null,
      linkedinDisplayName: display?.linkedinName ?? null,
    };
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {t("page.title", { ns: "web_posts" })}
          </h1>
          <p className="text-sm text-slate-500">
            {t("page.subtitle", { ns: "web_posts" })}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/dashboard/leads/generate"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {t("page.actions.back_to_generate", { ns: "web_posts" })}
          </Link>
          <Link
            href="/dashboard/leads/generate/scheduled"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {t("page.actions.scheduled", { ns: "web_posts" })}
          </Link>
          <Link
            href="/dashboard/leads/generate/recurring"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {t("page.actions.recurring", { ns: "web_posts" })}
          </Link>
          <Link
            href="/dashboard/leads/generate/post/new"
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            {t("page.actions.new_post", { ns: "web_posts" })}
          </Link>
        </div>
      </div>

      {top.hasMetrics && top.items.length > 0 && (
        <TopPerformersStrip items={top.items} windowDays={top.windowDays} />
      )}

      <PostsListClient posts={posts} />
    </div>
  );
}
