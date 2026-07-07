import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { generateWeeklyDigest } from "@/lib/newsletter/generateDigest";

export const runtime = "nodejs";
// The digest calls Claude + web_search (streamed, 12 rounds). Give it headroom.
export const maxDuration = 300;

/**
 * Weekly Regional Newsletter — NATIONAL digest cron.
 *
 * Schedule: Wednesdays 13:00 UTC (see vercel.json). Computes the current week's
 * Monday as `week_of`, generates the national rate + housing news digest
 * (lib/newsletter/generateDigest.ts → Claude + web_search), and upserts it into
 * newsletter_digests on week_of (idempotent — a re-run overwrites the week).
 *
 * Auth + SERVICE_ROLE guard mirror the sibling crons (weekly-digest, etc.):
 * a Bearer CRON_SECRET is required when configured, and we no-op without the
 * service-role key since the RLS-deny newsletter_digests table needs it to write.
 *
 * Override: ?week=YYYY-MM-DD forces a specific week (manual backfill/smoke).
 */
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return NextResponse.json(
      { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY not configured" },
      { status: 500 },
    );
  }

  try {
    const url = new URL(req.url);
    const forced = url.searchParams.get("week");
    const weekOf =
      forced && /^\d{4}-\d{2}-\d{2}$/.test(forced) ? forced : currentMondayUtc();

    const digest = await generateWeeklyDigest(weekOf);
    if (!digest) {
      return NextResponse.json(
        { ok: false, weekOf, error: "digest generation returned null" },
        { status: 502 },
      );
    }

    const { error } = await supabaseServer
      .from("newsletter_digests")
      .upsert(
        {
          week_of: weekOf,
          title: digest.title,
          intro: digest.intro,
          items: digest.items,
          sources: digest.sources,
          status: "published",
        },
        { onConflict: "week_of" },
      );
    if (error) throw error;

    return NextResponse.json({
      ok: true,
      weekOf,
      items: digest.items.length,
      sources: digest.sources.length,
    });
  } catch (e) {
    console.error("newsletter-digest cron error", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 },
    );
  }
}

/** The Monday (00:00 UTC) of the current week as YYYY-MM-DD. */
function currentMondayUtc(): string {
  const d = new Date();
  const day = d.getUTCDay(); // 0=Sun … 6=Sat
  const diff = (day + 6) % 7; // days since Monday
  const monday = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff),
  );
  return monday.toISOString().slice(0, 10);
}
