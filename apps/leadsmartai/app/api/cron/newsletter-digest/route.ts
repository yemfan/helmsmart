import { NextResponse } from "next/server";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "@leadsmart/i18n";
import { supabaseServer } from "@/lib/supabaseServer";
import { generateWeeklyDigest } from "@/lib/newsletter/generateDigest";

export const runtime = "nodejs";
// The digest calls Claude + web_search (streamed, 12 rounds), once per
// supported language, sequentially. Give it the whole ceiling.
export const maxDuration = 800;

/**
 * Weekly Regional Newsletter — NATIONAL digest cron.
 *
 * Schedule: Wednesdays 13:00 UTC (see vercel.json). Computes the current week's
 * Monday as `week_of`, generates the national rate + housing news digest
 * (lib/newsletter/generateDigest.ts → Claude + web_search) ONCE PER SUPPORTED
 * LANGUAGE, and upserts each into newsletter_digests on (week_of, language)
 * (idempotent — a re-run overwrites the week).
 *
 * Per-language rather than per-reader because this digest is national: it is
 * the same news for every subscriber, so there is no one reader whose language
 * it could follow. It is written in all of them and the send picks.
 *
 * Each language is generated independently and a failure is isolated: Chinese
 * failing must not lose the English issue that most subscribers receive. The
 * response is 502 only when the DEFAULT locale failed, since that is the one
 * every other language falls back to.
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

    // ?lang= narrows a manual run to one language (retrying the half of a
    // week that failed, or smoke-testing a new locale without paying for
    // every other one). Unrecognized values generate nothing rather than
    // silently generating English under the wrong label.
    const langParam = url.searchParams.get("lang");
    const locales = langParam
      ? SUPPORTED_LOCALES.filter((l) => l === langParam)
      : SUPPORTED_LOCALES;
    if (locales.length === 0) {
      return NextResponse.json(
        { ok: false, error: `unknown language: ${langParam}` },
        { status: 400 },
      );
    }

    // Sequential, not Promise.all: each run is a long streamed tool loop, and
    // running them together triples the peak rate-limit draw for no wall-clock
    // benefit the cron cares about.
    const results: { language: string; items: number; error?: string }[] = [];
    for (const language of locales) {
      try {
        const digest = await generateWeeklyDigest(weekOf, language);
        if (!digest) {
          results.push({ language, items: 0, error: "generation returned null" });
          continue;
        }

        const { error } = await supabaseServer
          .from("newsletter_digests")
          .upsert(
            {
              week_of: weekOf,
              language,
              title: digest.title,
              intro: digest.intro,
              items: digest.items,
              sources: digest.sources,
              status: "published",
            },
            { onConflict: "week_of,language" },
          );
        if (error) throw error;
        results.push({ language, items: digest.items.length });
      } catch (e) {
        // Isolated: one language failing leaves the others published.
        console.error("[newsletter-digest] language failed", { language, e });
        results.push({
          language,
          items: 0,
          error: e instanceof Error ? e.message : "unknown error",
        });
      }
    }

    // The default locale is the fallback every other language reads when its
    // own variant is missing, so losing it loses the week for everyone.
    const fallback = results.find((r) => r.language === DEFAULT_LOCALE);
    const ok = !fallback || !fallback.error;
    return NextResponse.json({ ok, weekOf, results }, { status: ok ? 200 : 502 });
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
