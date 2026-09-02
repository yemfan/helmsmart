import { NextResponse } from "next/server";

import { publishCarouselPost } from "@/lib/leads-gen/carousel-post";
import { publishPost } from "@/lib/leads-gen/publish";
import { postMediaKind } from "@/lib/marketing-hub/mediaKind";
import { runReelRenderTick } from "@/lib/social/enqueueReels";
import {
  DRAIN_BUDGET_MS,
  STALE_POSTING_MS,
  nextRetryDelay,
  outOfDrainBudget,
  reapDecision,
  type StalePostingRow,
} from "@/lib/leads-gen/publishQueue";
import { dispatchMobilePublishFailurePush } from "@/lib/mobile/pushDispatch";
import { logAssistantActivity } from "@/lib/closeboss/activities";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
// Cron may pick up a batch of overdue posts. 60s was not enough: a batch of
// video reels is claimed up front and published serially, so the function was
// killed mid-batch and left every unprocessed row stranded in 'posting'. The
// loop now stops itself at DRAIN_BUDGET_MS, well inside this ceiling.
export const maxDuration = 300;

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
 * Reaper: a THIRD path (reapStalePosting) catches rows stuck in 'posting'
 * with next_attempt_at NULL — claimed by a run that died before writing
 * an outcome. Neither queue above can see those (the first only reads
 * 'scheduled'; the second's `next_attempt_at <= now()` never matches NULL),
 * so without the reaper they stay claimed forever and the post silently
 * never appears.
 *
 * Bounded fan-out: caps at 25 rows per invocation. If more are due
 * the next cron tick picks the rest up. Prevents one giant batch
 * from blowing the maxDuration.
 */

const BATCH_LIMIT = 25;

/** Columns publishPost + the cron's bookkeeping need from a claimed row. */
const DUE_POST_COLS =
  "id, agent_id, social_account_id, platform, caption, hashtags, media_library_id, image_url, trigger_kind, subject_kind, subject_ref_id, attempt_count, carousel_id";

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

/**
 * Third queue: rows stranded in 'posting' by a run that died between claiming
 * and writing an outcome. Invisible to both queues above, so without this they
 * never move again — no error, no retry, no published post, and (once the
 * Marketing Hub surfaces published content) a hole the agent can't explain.
 *
 * Rows still inside STALE_POSTING_MS are left alone: a live run may be working
 * on them, and reviving one of those would double-post.
 *
 * Returns how many were pushed back into the retry queue vs. failed outright.
 */
async function reapStalePosting(): Promise<{ requeued: number; failed: number }> {
  const now = Date.now();
  const staleBefore = new Date(now - STALE_POSTING_MS).toISOString();

  const { data, error } = await supabaseAdmin
    .from("scheduled_posts")
    .select("id, attempt_count, scheduled_for, updated_at")
    .eq("status", "posting")
    .is("next_attempt_at", null)
    .lt("updated_at", staleBefore)
    .order("updated_at", { ascending: true })
    .limit(BATCH_LIMIT);
  if (error) {
    console.error("[cron/publish-scheduled] reaper select failed:", error.message);
    return { requeued: 0, failed: 0 };
  }

  let requeued = 0;
  let failed = 0;
  for (const row of ((data as StalePostingRow[] | null) ?? [])) {
    const decision = reapDecision(row, now);
    if (decision.action === "leave") continue;

    // Every write below is guarded on the row still being an unscheduled
    // 'posting' row, so a run that woke up between our select and our write
    // keeps its claim.
    const nowIso = new Date().toISOString();

    if (decision.action === "requeue") {
      // Hand it to the RETRY queue rather than back to 'scheduled': that path
      // already bumps attempt_count per row under optimistic concurrency, so a
      // row that keeps dying mid-publish still converges on 'failed' instead of
      // looping forever.
      const { error: updErr } = await supabaseAdmin
        .from("scheduled_posts")
        .update({ next_attempt_at: nowIso, updated_at: nowIso } as Record<string, unknown>)
        .eq("id", row.id)
        .eq("status", "posting")
        .is("next_attempt_at", null);
      if (!updErr) requeued += 1;
      continue;
    }

    const { error: updErr } = await supabaseAdmin
      .from("scheduled_posts")
      .update({
        status: "failed",
        last_error: decision.reason.slice(0, 1000),
        updated_at: nowIso,
      } as Record<string, unknown>)
      .eq("id", row.id)
      .eq("status", "posting")
      .is("next_attempt_at", null);
    if (!updErr) failed += 1;
  }

  return { requeued, failed };
}

/**
 * Un-claim rows this tick claimed but ran out of time to publish. They go back
 * to 'scheduled' with attempt_count cleared: we never called the platform, so
 * charging the post a retry would be wrong.
 */
async function releaseUnprocessed(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const nowIso = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("scheduled_posts")
    .update({
      status: "scheduled",
      attempt_count: 0,
      next_attempt_at: null,
      updated_at: nowIso,
    } as Record<string, unknown>)
    .in("id", ids)
    .eq("status", "posting");
  if (error) {
    console.error("[cron/publish-scheduled] release failed:", error.message);
  }
}

export async function POST(req: Request) {
  if (!authorize(req)) {
    return new Response("Forbidden", { status: 403 });
  }

  const startedAt = Date.now();

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

    // Reap first: a stranded row that's still worth sending is put back in the
    // retry queue BEFORE we claim, so it can go out on this same tick.
    const reaped = await reapStalePosting();
    if (reaped.requeued || reaped.failed) {
      console.warn("[cron/publish-scheduled] reaped stale 'posting' rows:", reaped);
    }

    const due = await claimDuePosts();
    if (due.length === 0) {
      return NextResponse.json({ ok: true, processed: 0, summary: "nothing due", reaped, reelTick });
    }

    let posted = 0;
    let retried = 0;
    let permanentlyFailed = 0;
    let released = 0;

    for (const [index, row] of due.entries()) {
      // Stop before the platform kills us mid-publish. Rows we claimed but
      // never touched go back to 'scheduled' for the next tick — that is the
      // orphaning this whole file's 'posting' backlog came from.
      if (outOfDrainBudget(startedAt, Date.now())) {
        const remaining = due.slice(index).map((r) => r.id);
        await releaseUnprocessed(remaining);
        released = remaining.length;
        console.warn(
          `[cron/publish-scheduled] out of budget (${DRAIN_BUDGET_MS}ms) — released ${released} unprocessed rows`,
        );
        break;
      }

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
            /*
             * Reel rows carry a rendered MP4 in image_url. This used to be an
             * inline ternary here and nowhere else, so the public hub — which
             * renders the same rows — had no way to know, and drew a broken
             * <img> over a working video. Same rule, one definition now.
             */
            mediaKind: postMediaKind({ url: row.image_url, subjectKind: row.subject_kind }) as
              | "image"
              | "video",
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
      processed: due.length - released,
      posted,
      retried,
      permanentlyFailed,
      released,
      reaped,
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
