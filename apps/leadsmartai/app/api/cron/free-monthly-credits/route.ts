import { NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cronAuth";
import { grantCredits } from "@/lib/credits/ledger";
import {
  decideFreeGrant,
  emptyRun,
  freeGrantRef,
  grantPeriod,
} from "@/lib/credits/freeGrant";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Monthly credits for free accounts — the grant `/plans` already promises.
 *
 * The pricing page has advertised "100 credits / month" on the free tier since
 * the 2026-08-30 ladder while nothing granted them: the only `monthly_grant`
 * in the app fires from a paid Stripe invoice, which a free account never has.
 *
 * SAFE TO RUN TWICE. Every grant carries `free_monthly:<user>:<YYYY-MM>` as
 * its ref; `credit_ledger.ref` has a unique index and `grant_credits`
 * short-circuits on an existing one, so a retry, an overlap, or a manual
 * re-run in the same month grants once. The month lives in the key rather
 * than in any state of this route's own, which is what makes that true
 * without a lock.
 *
 * Deliberately runs on the 1st rather than per-account anniversary. An agent
 * who signed up on the 29th gets their first monthly grant sooner than a full
 * month later, which errs toward the customer, and it means the whole tier
 * refreshes on one predictable day instead of trickling.
 */
export async function GET(req: Request) {
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const period = grantPeriod(new Date());
  const run = emptyRun(period);

  try {
    // `plan` is the derived cache maintained from billing_subscriptions; it is
    // filtered again per row by decideFreeGrant so the rule lives in one place
    // and a widened query here cannot quietly start paying paid accounts twice.
    const { data, error } = await supabaseAdmin
      .from("leadsmart_users")
      .select("user_id, plan, credits")
      .limit(5000);

    if (error) {
      console.error("[cron.free-credits] read failed:", error.message);
      return NextResponse.json({ ok: false, error: "read_failed" }, { status: 500 });
    }

    const rows = (data as Array<{ user_id: string; plan: string | null; credits: number | null }>) ?? [];

    // Which accounts already have this month's grant.
    //
    // The RPC would short-circuit on the ref anyway, so this is not what makes
    // the run safe — it is what makes the run REPORT honestly. grant_credits
    // returns the balance whether it granted or not, so without this a re-run
    // counted every skip as a grant and claimed to have handed out credits it
    // had not. It also saves a round trip per account on any re-run.
    const { data: existing } = await supabaseAdmin
      .from("credit_ledger")
      .select("ref")
      .like("ref", `free_monthly:%:${period}`)
      .limit(5000);
    const alreadyGranted = new Set(
      ((existing as Array<{ ref: string | null }> | null) ?? [])
        .map((r) => r.ref)
        .filter((r): r is string => Boolean(r)),
    );

    for (const row of rows) {
      run.considered += 1;
      const decision = decideFreeGrant(row);

      if (!decision.grant) {
        if (decision.reason === "not_free") run.skippedNotFree += 1;
        else run.skippedAtCeiling += 1;
        continue;
      }

      const ref = freeGrantRef(row.user_id, period);
      if (alreadyGranted.has(ref)) {
        run.skippedAlreadyGranted += 1;
        continue;
      }

      try {
        await grantCredits(row.user_id, decision.amount, "monthly_grant", ref);
        run.granted += 1;
      } catch (e) {
        // One account failing must not cost everyone else their credits.
        run.failed += 1;
        console.warn(
          "[cron.free-credits] grant failed for one account:",
          e instanceof Error ? e.message : e,
        );
      }
    }

    console.info("[cron.free-credits]", JSON.stringify(run));
    return NextResponse.json({ ok: true, ...run });
  } catch (e) {
    console.error("[cron.free-credits] threw:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "failed", ...run }, { status: 500 });
  }
}
