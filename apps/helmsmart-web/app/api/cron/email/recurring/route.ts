/**
 * Recurring email campaign cron — GET /api/cron/email/recurring
 *
 * Runs hourly. Finds recurring email campaigns whose next_run_at has passed,
 * clones their content into a fresh one-off campaign, sends it, then advances
 * next_run_at to the following occurrence.
 *
 * Auth: Bearer CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendEmailCampaign } from "@/lib/integrations/email-campaign-sender";
import { computeNextRun, type RecurrenceInterval } from "@/lib/recurrence";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const db = await createServiceClient();
  const now = new Date();
  const nowIso = now.toISOString();

  // Find recurring campaigns due to run
  const { data: recurring } = await db
    .from("email_campaigns")
    .select("*")
    .eq("is_recurring", true)
    .not("next_run_at", "is", null)
    .lte("next_run_at", nowIso)
    .limit(50);

  if (!recurring?.length) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  let processed = 0;
  const results: Array<{ parentId: string; childId?: string; sent?: number; error?: string }> = [];

  for (const parent of recurring) {
    try {
      // Clone the campaign content into a fresh one-off draft
      const { data: child, error: cloneErr } = await db
        .from("email_campaigns")
        .insert({
          organization_id:   parent.organization_id,
          name:              `${parent.name} — ${now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
          description:        parent.description,
          campaign_type:      parent.campaign_type,
          subject:            parent.subject,
          preview_text:       parent.preview_text,
          body_html:          parent.body_html,
          body_text:          parent.body_text,
          from_name:          parent.from_name,
          reply_to:           parent.reply_to,
          target_segment:     parent.target_segment,
          target_pipeline_stages: parent.target_pipeline_stages,
          status:             "draft",
          is_recurring:       false,
          parent_campaign_id: parent.id,
          created_by:         parent.created_by,
        })
        .select("id")
        .single();

      if (cloneErr || !child) {
        results.push({ parentId: parent.id, error: cloneErr?.message ?? "clone failed" });
        continue;
      }

      // Send the cloned campaign
      const sendResult = await sendEmailCampaign(parent.organization_id, child.id);

      // Advance the schedule on the parent
      const nextRun = computeNextRun(
        (parent.recurrence_interval as RecurrenceInterval) ?? "monthly",
        parent.recurrence_day ?? 1,
        parent.recurrence_hour ?? 9,
        now
      );

      await db
        .from("email_campaigns")
        .update({ last_run_at: nowIso, next_run_at: nextRun })
        .eq("id", parent.id);

      processed++;
      results.push({ parentId: parent.id, childId: child.id, sent: sendResult.sent });
    } catch (e) {
      results.push({ parentId: parent.id, error: e instanceof Error ? e.message : "unknown" });
    }
  }

  return NextResponse.json({ ok: true, processed, results });
}
