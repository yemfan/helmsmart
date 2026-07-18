/**
 * GET /api/cron/social/publish
 * Publishes due scheduled `social_posts` across all orgs and platforms.
 *
 * Replaces /api/cron/social/linkedin, which filtered `.eq("platform","linkedin")`.
 * That filter was the bug: a scheduled X / Facebook / Instagram post was never
 * selected, so it sat at status='scheduled' FOREVER — never published, never
 * failed, no error recorded, still showing as queued in the UI. A capability we
 * don't have looked exactly like one that was working.
 *
 * Now every due post is claimed. Ones we can publish are published; ones we
 * can't are marked failed with a reason the author can act on. Either way the
 * post LEAVES the scheduled state, so the queue always tells the truth.
 *
 * Inline Bearer CRON_SECRET auth (matching the other cron routes).
 */
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { publishLinkedInPost } from "@/lib/linkedin";
import { canPublish, patchSocialPost, unsupportedReason } from "@/lib/social-platforms";

export const dynamic = "force-dynamic";

type DuePost = {
  id: string;
  organization_id: string;
  content: string;
  platform: string;
};

export async function GET(request: Request) {
  const CRON_SECRET = process.env.CRON_SECRET;
  const auth = request.headers.get("Authorization");
  if (!auth || !CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await createServiceClient();
  const nowIso = new Date().toISOString();

  // No platform filter — every due post gets resolved one way or the other.
  const { data: due } = await db
    .from("social_posts")
    .select("id, organization_id, content, platform")
    .eq("status", "scheduled")
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(25);

  const rows = (due ?? []) as DuePost[];
  const results: Array<{ id: string; platform: string; ok: boolean; error?: string }> = [];
  let published = 0;
  let unsupported = 0;
  let failed = 0;

  for (const row of rows) {
    if (!canPublish(row.platform)) {
      // Not a crash — a capability we don't have. Say so on the row instead of
      // leaving it queued forever.
      const error = unsupportedReason(row.platform);
      await patchSocialPost(db, row.id, {
        status: "failed",
        last_error: error,
        updated_at: nowIso,
      });
      unsupported++;
      results.push({ id: row.id, platform: row.platform, ok: false, error });
      continue;
    }

    const res = await publishLinkedInPost(row.organization_id, row.content);
    await patchSocialPost(
      db,
      row.id,
      res.ok
        ? {
            status: "published",
            published_url: res.url ?? null,
            published_at: nowIso,
            last_error: null,
            updated_at: nowIso,
          }
        : {
            status: "failed",
            last_error: res.error ?? "Publishing failed.",
            updated_at: nowIso,
          },
    );

    if (res.ok) published++;
    else failed++;
    results.push({ id: row.id, platform: row.platform, ok: res.ok, error: res.error });
  }

  return NextResponse.json({
    ok: true,
    processed: rows.length,
    published,
    failed,
    unsupported,
    results,
  });
}
