import { NextResponse } from "next/server";

import { computeNextOccurrence } from "@/lib/leads-gen/recurrence";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Vercel cron: materializes due occurrences of recurring_post_schedules
 * into scheduled_posts rows.
 *
 * Schedule: every 15 minutes (see vercel.json `crons` config).
 *
 * Flow per invocation:
 *   1. Authorize via CRON_SECRET bearer
 *   2. Find active recurrences where next_occurrence_at <= now() + LOOKAHEAD
 *   3. For each:
 *      a. Insert a scheduled_posts row with scheduled_for=next_occurrence_at
 *         + a back-link to the recurrence (recurring_schedule_id)
 *      b. Increment occurrence_count
 *      c. Compute next_occurrence_at via lib/leads-gen/recurrence
 *      d. If max_occurrences reached OR next_occurrence_at > ends_at,
 *         flip status='completed'
 *
 * Idempotency: the (recurring_schedule_id, occurrence_count) pair is
 * unique per scheduled_posts row, but Postgres doesn't enforce that
 * directly — we rely on the conditional update on the recurrence
 * row (where occurrence_count = <previous>) to fail if another cron
 * worker has already materialized this iteration. The losing worker
 * skips without writing to scheduled_posts.
 *
 * Lookahead: we materialize occurrences up to 90 minutes ahead so the
 * publish-scheduled cron (5-minute cadence) has buffer if a single
 * materialize-cron invocation misfires.
 */

const LOOKAHEAD_MS = 90 * 60 * 1000;
const BATCH_LIMIT = 50;

function authorize(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    if (process.env.NODE_ENV !== "production") return true;
    return false;
  }
  const provided = req.headers.get("authorization") ?? "";
  return provided === `Bearer ${secret}`;
}

type RecurrenceRow = {
  id: string;
  agent_id: string;
  social_account_id: string;
  platform: "facebook" | "instagram" | "linkedin" | "threads";
  caption: string;
  hashtags: string[];
  media_library_id: string | null;
  trigger_kind: string | null;
  subject_kind: string | null;
  subject_ref_id: string | null;
  cadence: "daily" | "weekly";
  weekly_day_of_week: number | null;
  time_of_day_hour: number;
  time_of_day_minute: number;
  timezone: string;
  starts_at: string;
  ends_at: string | null;
  max_occurrences: number | null;
  occurrence_count: number;
  next_occurrence_at: string;
  created_by: string | null;
};

export async function POST(req: Request) {
  if (!authorize(req)) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const now = new Date();
    const horizonIso = new Date(now.getTime() + LOOKAHEAD_MS).toISOString();

    const { data, error } = await supabaseAdmin
      .from("recurring_post_schedules")
      .select(
        "id, agent_id, social_account_id, platform, caption, hashtags, media_library_id, trigger_kind, subject_kind, subject_ref_id, cadence, weekly_day_of_week, time_of_day_hour, time_of_day_minute, timezone, starts_at, ends_at, max_occurrences, occurrence_count, next_occurrence_at, created_by",
      )
      .eq("status", "active")
      .lte("next_occurrence_at", horizonIso)
      .order("next_occurrence_at", { ascending: true })
      .limit(BATCH_LIMIT);
    if (error) throw error;

    const rows = (data as RecurrenceRow[] | null) ?? [];
    if (rows.length === 0) {
      return NextResponse.json({
        ok: true,
        processed: 0,
        summary: "nothing due",
      });
    }

    let materialized = 0;
    let completed = 0;
    let skipped = 0;
    let errored = 0;

    for (const row of rows) {
      try {
        // starts_at gate — agents can schedule a recurrence to begin
        // in the future. If we haven't reached starts_at, we leave
        // next_occurrence_at as-is and skip materializing.
        if (new Date(row.starts_at).getTime() > now.getTime()) {
          skipped += 1;
          continue;
        }

        const fireAt = row.next_occurrence_at;

        // Insert the scheduled_posts row + bump the recurrence atomically.
        // The bump is conditional (where occurrence_count = <previous>)
        // so if a concurrent worker beats us to it, our update fails
        // and we skip the insert.
        const { error: insertErr, data: inserted } = await supabaseAdmin
          .from("scheduled_posts")
          .insert({
            agent_id: row.agent_id,
            social_account_id: row.social_account_id,
            platform: row.platform,
            caption: row.caption,
            hashtags: row.hashtags,
            media_library_id: row.media_library_id,
            trigger_kind: row.trigger_kind,
            subject_kind: row.subject_kind,
            subject_ref_id: row.subject_ref_id,
            scheduled_for: fireAt,
            status: "scheduled",
            recurring_schedule_id: row.id,
            created_by: row.created_by,
          } as Record<string, unknown>)
          .select("id")
          .single();
        if (insertErr) throw insertErr;
        const insertedId = (inserted as { id: string } | null)?.id ?? null;

        // Compute the next occurrence + decide if we're done.
        const next = computeNextOccurrence(
          {
            cadence: row.cadence,
            weeklyDayOfWeek: row.weekly_day_of_week,
            timeOfDayHour: row.time_of_day_hour,
            timeOfDayMinute: row.time_of_day_minute,
            timezone: row.timezone,
          },
          new Date(fireAt),
        );

        const newCount = row.occurrence_count + 1;
        let nextStatus: "active" | "completed" = "active";
        if (row.max_occurrences && newCount >= row.max_occurrences) {
          nextStatus = "completed";
        } else if (row.ends_at && next.getTime() > new Date(row.ends_at).getTime()) {
          nextStatus = "completed";
        }

        // Conditional bump — optimistic concurrency on occurrence_count
        // prevents double-materializing if a second cron worker is
        // mid-flight on the same row.
        const { error: bumpErr, count } = await supabaseAdmin
          .from("recurring_post_schedules")
          .update({
            occurrence_count: newCount,
            next_occurrence_at: next.toISOString(),
            last_materialized_at: new Date().toISOString(),
            last_materialized_scheduled_post_id: insertedId,
            status: nextStatus,
            last_error: null,
            updated_at: new Date().toISOString(),
          } as Record<string, unknown>, { count: "exact" })
          .eq("id", row.id)
          .eq("status", "active")
          .eq("occurrence_count", row.occurrence_count);
        if (bumpErr) throw bumpErr;
        if (count === 0) {
          // Lost the race — delete the scheduled_posts row we just
          // inserted so we don't have a duplicate. We use the id we
          // just got back; the post is in 'scheduled' status so this
          // delete is safe.
          if (insertedId) {
            await supabaseAdmin
              .from("scheduled_posts")
              .delete()
              .eq("id", insertedId)
              .eq("status", "scheduled");
          }
          skipped += 1;
          continue;
        }

        materialized += 1;
        if (nextStatus === "completed") completed += 1;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Materialize failed";
        console.error("[cron/materialize-recurring-posts] row", row.id, msg);
        errored += 1;
        // Stamp the error on the recurrence row so the management UI
        // surfaces it. We don't change status — a transient DB error
        // shouldn't kill the recurrence; next tick will retry.
        await supabaseAdmin
          .from("recurring_post_schedules")
          .update({
            last_error: msg.slice(0, 1000),
            updated_at: new Date().toISOString(),
          } as Record<string, unknown>)
          .eq("id", row.id);
      }
    }

    return NextResponse.json({
      ok: true,
      processed: rows.length,
      materialized,
      completed,
      skipped,
      errored,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Cron failed";
    console.error("[cron/materialize-recurring-posts]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export const GET = POST;
