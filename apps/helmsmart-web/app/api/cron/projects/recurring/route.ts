/**
 * GET /api/cron/projects/recurring
 *
 * Spawns a fresh project from each active recurring_projects template whose
 * next_run_date <= today, then advances next_run_date by its frequency.
 * The generated project's name is suffixed with the period (e.g. "Retainer —
 * May 2026") so each cycle is distinguishable. Runs daily via Vercel Cron.
 *
 * Auth: Bearer token via CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClientFor, packServiceConns } from "@/lib/supabase/server";
import { advanceByFrequency, latestCalendarDate } from "@/lib/org-date";
import { orgTodays } from "@/lib/org-timezone";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // A template is due by its own org's date, not the server's. The query takes
  // the latest date any zone can be on; the filter below holds each row to its org.
  const now = new Date();
  const horizon = latestCalendarDate(now);
  let processed = 0;
  let generated = 0;
  const errors: string[] = [];

  // Process every vertical's orgs — Core plus the medical project (if configured).
  for (const conn of packServiceConns()) {
    const supabase = createServiceClientFor(conn);

    const { data: due, error } = await supabase
      .from("recurring_projects")
      .select("*")
      .eq("status", "active")
      .lte("next_run_date", horizon);

    if (error) {
      errors.push(error.message);
      continue;
    }
    const todayOf = await orgTodays(supabase, (due ?? []).map((r) => r.organization_id as string), now);
    const ready = (due ?? []).filter((r) => (r.next_run_date as string) <= todayOf(r.organization_id as string));
    processed += ready.length;

    for (const rec of ready) {
      try {
        const period = new Date(rec.next_run_date + "T00:00:00").toLocaleDateString("en-US", {
          month: "short",
          year: "numeric",
        });

        const { error: insErr } = await supabase.from("projects").insert({
          organization_id: rec.organization_id,
          client_id: rec.client_id ?? null,
          name: `${rec.name} — ${period}`,
          description: rec.description ?? null,
          status: "active",
          color: rec.color ?? "indigo",
          budget_hours: rec.budget_hours,
          budget_amount: rec.budget_amount,
          hourly_rate: rec.hourly_rate,
        });
        if (insErr) throw new Error(insErr.message);

        await supabase
          .from("recurring_projects")
          .update({
            next_run_date: advanceByFrequency(rec.next_run_date, rec.frequency),
            last_generated_at: new Date().toISOString(),
          })
          .eq("id", rec.id);

        generated++;
      } catch (err) {
        errors.push(`${rec.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return NextResponse.json({ ok: true, processed, generated, errors });
}
