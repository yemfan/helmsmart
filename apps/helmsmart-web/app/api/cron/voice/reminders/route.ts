/**
 * GET /api/cron/voice/reminders
 *
 * Every few minutes: for each org with appointment reminders enabled, schedule
 * reminder calls for appointments that have entered the lead window, then place
 * any due calls (staggered, within calling hours). Runs via Vercel Cron.
 * Iterates every vertical (Core + medical, …) so each project's orgs are served.
 *
 * It also drains any org that simply HAS queued calls. Reminders are not the
 * only thing that fills `outbound_call_queue` any more: Mark's
 * `schedule_ai_call` puts a row there when the owner approves one, and an
 * approval at 11pm has to ring the customer at 8am — from a business that may
 * never have turned appointment reminders on. Selecting only
 * `voice_reminder_enabled` orgs left those rows queued forever, which is the
 * silent-stall shape this app has been bitten by before.
 *
 * Auth: Bearer CRON_SECRET (Vercel sets this when crons are configured in
 * vercel.json and sends it automatically).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClientFor, packServiceConns } from "@/lib/supabase/server";
import { scheduleDueReminders, drainOutboundQueue, scheduleDueSmsReminders, drainSmsReminderQueue } from "@/lib/outbound-queue";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let orgCount = 0;
  let scheduled = 0;
  let placed = 0;
  let smsSent = 0;

  // Process every vertical's orgs — Core plus the medical project (if configured).
  for (const conn of packServiceConns()) {
    const db = createServiceClientFor(conn);
    const { data: orgs } = await db
      .from("organizations")
      .select("id, name, voice_reminder_lead_minutes, twilio_number, timezone")
      .eq("voice_reminder_enabled", true)
      .not("twilio_number", "is", null);

    orgCount += orgs?.length ?? 0;
    for (const org of orgs ?? []) {
      const orgId = org.id as string;
      const lead = (org.voice_reminder_lead_minutes as number) || 1440;

      // Voice reminders (Retell outbound call).
      scheduled += await scheduleDueReminders(db, orgId, lead);
      const voiceRes = await drainOutboundQueue(db, orgId, { limit: 25, staggerMs: 1500 });
      placed += voiceRes.placed;

      // SMS reminders (text message with reschedule link + CANCEL line).
      await scheduleDueSmsReminders(db, orgId, lead);
      const smsRes = await drainSmsReminderQueue(db, {
        orgId,
        orgName: (org.name as string) ?? "us",
        twilioNumber: org.twilio_number as string,
        timezone: (org.timezone as string) || "America/New_York",
      });
      smsSent += smsRes.sent;
    }

    // Orgs with calls waiting that the pass above didn't already serve —
    // an approved `schedule_ai_call` in a business that runs no reminders.
    const served = new Set((orgs ?? []).map((o) => o.id as string));
    const { data: waiting } = await db
      .from("outbound_call_queue")
      .select("organization_id")
      .eq("status", "queued")
      .limit(500);
    for (const orgId of new Set((waiting ?? []).map((r) => r.organization_id as string))) {
      if (served.has(orgId)) continue;
      orgCount += 1;
      // `drainOutboundQueue` loads the org's own context and is a no-op
      // outside its calling hours, so nothing here can ring out of hours.
      const res = await drainOutboundQueue(db, orgId, { limit: 25, staggerMs: 1500 });
      placed += res.placed;
    }
  }

  return NextResponse.json({ ok: true, orgs: orgCount, scheduled, placed, smsSent });
}
