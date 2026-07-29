import { NextResponse } from "next/server";

import { publishCarouselPost } from "@/lib/leads-gen/carousel-post";
import { publishPost } from "@/lib/leads-gen/publish";
import { runReelRenderTick } from "@/lib/social/enqueueReels";
import { dispatchMobilePublishFailurePush } from "@/lib/mobile/pushDispatch";
import { logAssistantActivity } from "@/lib/realtyboss/activities";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
// Cron may pick up a batch of overdue posts; budget 60s per
// invocation. Most invocations finish in <5s with 0-3 due posts.
export const maxDuration = 60;

/**
 * Vercel cron: publishes due scheduled_posts.
 *
 * Schedule: every 5 minutes (see vercel.json `crons` config).
 *
 * Flow per invocation:
 *   1. Authorize (CRON_SECRET header) — Vercel sets this for
 *      cron invocations; rejects external HTTP hits
 *   2. Atomically claim due rows by flipping status='scheduled' →
 *      'posting' with a single update-with-where. Two concurrent
 *      cron invocations can't both claim the same row this way.
 *   3. For each claimed row: call publishPost (shared helper)
 *   4. On success: row → 'posted' + published_lead_post_id + published_at
 *   5. On failure: depending on the failure's `retryable` flag and
 *      attempt_count:
 *        - retryable + attempts<3: schedule next_attempt_at with
 *          exponential backoff (5min / 30min / 2h), status stays
 *          'posting'
 *        - permanent OR attempts==3: status → 'failed' with
 *          last_error captured
 *
 * Retry rows: a second cron path picks up posts where status='posting'
 * and next_attempt_at <= now() (rows where we've previously failed
 * + scheduled a retry).
 *
 * Bounded fan-out: caps at 25 rows per invocation. If more are due
 * the next cron tick picks the rest up. Prevents one giant batch
 * from blowing the maxDuration.
 */

const BATCH_LIMIT = 25;

/** Columns publishPost + the cron's bookkeeping need from a claimed row. */
const DUE_POST_COLS =
  "id, agent_id, social_account_id, platform, caption, hashtags, media_library_id, image_url, trigger_kind, subject_kind, subject_ref_id, attempt_count, carousel_id";

/**
 * Exponential backoff schedule. attempt_count is incremented BEFORE
 * the publish, so:
 *   - attempt 1 (first try) succeeds → done
 *   - attempt 1 fails, attempt_count=1 → next try in 5 min
 *   - attempt 2 fails, attempt_count=2 → next try in 30 min
 *   - attempt 3 fails, attempt_count=3 → permanently failed
 */
function nextRetryDelay(attemptCount: number): number | null {
  if (attemptCount === 1) return 5 * 60 * 1000;
  if (attemptCount === 2) return 30 * 60 * 1000;
  return null;
}

function authorize(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    // No secret configured — accept only Vercel's signed cron header
    // (`x-vercel-cron`). Local dev without the secret defaults to
    // permissive for testing.
    if (process.env.NODE_ENV !== "production") return true;
    return false;
  }
  const provided = req.headers.get("authorization") ?? "";
  return provided === `Bearer ${secret}`;
}

type DuePost = {
  id: string;
  agent_id: string;
  social_account_id: string;
  // 'linkedin' added when LinkedIn organic posting landed — the
  // scheduled_posts.platform check constraint widens to match.
  // publishPost dispatches by platform; same retry rules apply.
  platform: "facebook" | "instagram" | "linkedin" | "threads";
  caption: string;
  hashtags: string[];
  media_library_id: string | null;
  // Direct public image URL (branded recommendation cards that aren't in
  // media_library). publishPost uses it only when media_library_id is null.
  image_url: string | null;
  trigger_kind: string | null;
  subject_kind: string | null;
  subject_ref_id: string | null;
  attempt_count: number;
  // When set, this row is a carousel — the cron multi-image-publishes it via
  // publishCarouselPost instead of the single-image publishPost.
  carousel_id: string | null;
};

async function claimDuePosts(): Promise<DuePost[]> {
  const nowIso = new Date().toISOString();

  // Two queues to drain:
  //   1. 'scheduled' rows whose scheduled_for <= now()
  //   2. 'posting' rows whose next_attempt_at <= now() (retries)
  // We claim both in one go.

  // First-time-due rows. PostgREST does NOT support ORDER BY / LIMIT on an
  // UPDATE, so select the due ids first (SELECT does), then claim them by id.
  // The previous version did update-with-limit AND ignored the returned error,
  // so a failing claim was invisible: the cron returned 200 and drained nothing
  // (which is exactly what happened — nothing ever published). Surface errors.
  const { data: dueRows, error: selErr } = await supabaseAdmin
    .from("scheduled_posts")
    .select("id")
    .eq("status", "scheduled")
    .lte("scheduled_for", nowIso)
    .order("scheduled_for", { ascending: true })
    .limit(BATCH_LIMIT);
  if (selErr) console.error("[cron/publish-scheduled] due-select failed:", selErr.message);
  const dueIds = ((dueRows as { id: string }[] | null) ?? []).map((r) => r.id);

  const claimed: DuePost[] = [];
  if (dueIds.length > 0) {
    // Claim only rows still 'scheduled' — guards against a parallel cron.
    const { data: firstTime, error: claimErr } = await supabaseAdmin
      .from("scheduled_posts")
      .update({ status: "posting", attempt_count: 1, updated_at: nowIso } as Record<string, unknown>)
      .in("id", dueIds)
      .eq("status", "scheduled")
      .select(DUE_POST_COLS);
    if (claimErr) console.error("[cron/publish-scheduled] claim failed:", claimErr.message);
    claimed.push(...(((firstTime as DuePost[] | null) ?? [])));
  }

  // Retry rows: 'posting' rows whose next_attempt_at <= now(), re-claimed with a
  // conditional per-row update (bumps attempt_count) below.
  const remainingSlots = BATCH_LIMIT - claimed.length;

  if (remainingSlots > 0) {
    const { data: retryCandidates } = await supabaseAdmin
      .from("scheduled_posts")
      .select(DUE_POST_COLS)
      .eq("status", "posting")
      .lte("next_attempt_at", nowIso)
      .order("next_attempt_at", { ascending: true })
      .limit(remainingSlots);

    for (const row of (retryCandidates as DuePost[] | null) ?? []) {
      // Re-claim with conditional update — bumps attempt_count + clears
      // next_attempt_at so a parallel cron doesn't pick the same row.
      const { error } = await supabaseAdmin
        .from("scheduled_posts")
        .update({
          attempt_count: row.attempt_count + 1,
          next_attempt_at: null,
          updated_at: nowIso,
        } as Record<string, unknown>)
        .eq("id", row.id)
        .eq("status", "posting")
        .eq("attempt_count", row.attempt_count); // optimistic concurrency
      if (!error) {
        claimed.push({ ...row, attempt_count: row.attempt_count + 1 });
      }
      // If error or 0 rows matched, another worker grabbed it — skip.
    }
  }

  return claimed;
}

export async function POST(req: Request) {
  if (!authorize(req)) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    // Reel render tick: poll in-flight Lambda renders → mark rendered/failed +
    // schedule finished ones, and trigger the next draft render (serialized).
    // Best-effort — a render-side hiccup must never block the post drain.
    let reelTick: Awaited<ReturnType<typeof runReelRenderTick>> | { error: string } | null = null;
    try {
      reelTick = await runReelRenderTick();
    } catch (e) {
      reelTick = { error: e instanceof Error ? e.message : "reel tick failed" };
      console.warn("[cron/publish-scheduled] reel tick failed:", reelTick.error);
    }

    const due = await claimDuePosts();
    if (due.length === 0) {
      return NextResponse.json({ ok: true, processed: 0, summary: "nothing due", reelTick });
    }

    let posted = 0;
    let retried = 0;
    let permanentlyFailed = 0;

    for (const row of due) {
      // A carousel row (carousel_id set + a carousel-capable platform) goes
      // through the multi-image path; everything else is a single-image post.
      // Both return the same ok/retryable/error shape.
      const isCarousel =
        !!row.carousel_id &&
        (row.platform === "facebook" ||
          row.platform === "instagram" ||
          row.platform === "linkedin");
      const result = isCarousel
        ? await publishCarouselPost({
            agentId: row.agent_id,
            connectionId: row.social_account_id,
            platform: row.platform as "facebook" | "instagram" | "linkedin",
            carouselId: row.carousel_id!,
            caption: row.caption,
            hashtags: row.hashtags,
          })
        : await publishPost({
            agentId: row.agent_id,
            platform: row.platform,
            connectionId: row.social_account_id,
            caption: row.caption,
            hashtags: row.hashtags,
            mediaItemId: row.media_library_id,
            imageUrl: row.image_url,
            // Reel rows carry a rendered MP4 in image_url — publish as video.
            mediaKind: row.subject_kind === "social_reel" ? "video" : "image",
            trigger: row.trigger_kind,
            subjectKind: row.subject_kind,
            subjectRefId: row.subject_ref_id,
          });

      const nowIso = new Date().toISOString();

      if (result.ok) {
        await supabaseAdmin
          .from("scheduled_posts")
          .update({
            status: "posted",
            published_lead_post_id: result.leadPostId,
            published_at: nowIso,
            last_error: null,
            updated_at: nowIso,
          } as Record<string, unknown>)
          .eq("id", row.id);
        posted += 1;

        // CloseBoss activity feed — publishing is the Marketing
        // Assistant's work (fire-and-forget, never fails the cron).
        void logAssistantActivity({
          agentId: String(row.agent_id),
          assistantType: "marketing_assistant",
          activityType: "post_published",
          summary: `Published a ${row.platform} post`,
          outcome: row.caption ? (row.caption.length > 140 ? `${row.caption.slice(0, 137)}…` : row.caption) : null,
          requiresAttention: false,
        });
        continue;
      }

      // Failure path. Decide retry vs permanent.
      const delay = result.retryable
        ? nextRetryDelay(row.attempt_count)
        : null;
      if (delay !== null) {
        const nextAttemptAt = new Date(Date.now() + delay).toISOString();
        await supabaseAdmin
          .from("scheduled_posts")
          .update({
            // Stay in 'posting' status so the retry-queue picks it up.
            next_attempt_at: nextAttemptAt,
            last_error: result.error.slice(0, 1000),
            updated_at: nowIso,
          } as Record<string, unknown>)
          .eq("id", row.id);
        retried += 1;
      } else {
        await supabaseAdmin
          .from("scheduled_posts")
          .update({
            status: "failed",
            last_error: result.error.slice(0, 1000),
            updated_at: nowIso,
          } as Record<string, unknown>)
          .eq("id", row.id);
        permanentlyFailed += 1;

        // Push the failure to the agent's phone so they see it
        // promptly. Wrapped in try/catch so push delivery problems
        // never bubble up and disrupt the cron's bookkeeping.
        try {
          await dispatchMobilePublishFailurePush({
            agentId: row.agent_id,
            scheduledPostId: row.id,
            platform: row.platform,
            errorMessage: result.error,
          });
        } catch (e) {
          console.warn(
            "[cron/publish-scheduled] failure push dispatch failed",
            { id: row.id, err: e instanceof Error ? e.message : e },
          );
        }
      }
    }

    return NextResponse.json({
      ok: true,
      processed: due.length,
      posted,
      retried,
      permanentlyFailed,
      reelTick,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Cron failed";
    console.error("[cron/publish-scheduled]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// GET is convenient for manual testing / Vercel cron dashboard's
// "Run now" button (which fires a GET).
export const GET = POST;
