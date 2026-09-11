/**
 * GET /api/cron/bills/recurring
 *
 * Spawns a fresh open bill from each active recurring_bills template whose
 * next_run_date <= today (issue_date = next_run_date, due_date = issue +
 * due_days), then advances next_run_date by its frequency. Runs daily via
 * Vercel Cron. Cash-basis: the bill is just an obligation — the expense posts
 * to the ledger when it's marked paid in /books/bills.
 *
 * Auth: Bearer token via CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClientFor, packServiceConns } from "@/lib/supabase/server";
import { addDays, advanceByFrequency, latestCalendarDate } from "@/lib/org-date";
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
      .from("recurring_bills")
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
        const issueDate = rec.next_run_date as string;
        const dueDate = addDays(issueDate, rec.due_days ?? 30);

        const { error: insErr } = await supabase.from("bills").insert({
          organization_id: rec.organization_id,
          vendor: rec.vendor,
          description: rec.description ?? null,
          expense_account_id: rec.expense_account_id ?? null,
          amount: rec.amount,
          issue_date: issueDate,
          due_date: dueDate,
          status: "open",
        });
        if (insErr) throw new Error(insErr.message);

        await supabase
          .from("recurring_bills")
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
