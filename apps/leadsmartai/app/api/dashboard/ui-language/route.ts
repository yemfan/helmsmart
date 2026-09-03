import { NextResponse } from "next/server";

import { getCurrentAgentContext } from "@/lib/dashboardService";
import { SUPPORTED_LOCALES } from "@/lib/i18n/config";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Persist the agent's UI language.
 *
 * The language toggle wrote a cookie and nothing else, so the agent's choice
 * lived exclusively in their browser. Anything running WITHOUT a request had
 * no way to learn it — the overnight Boss run, the 5-minute instruction cron,
 * every scheduled generator — and so wrote English to a Chinese dashboard.
 * `user_profiles.ui_language` has existed for that purpose since the
 * localization-preferences migration; it was simply never written (0 of 21
 * rows populated when this was found).
 *
 * The cookie stays the fast path for rendering: it needs no round trip and
 * works signed out. This is the durable copy, for readers that have no cookie
 * to read. Best-effort by design — a failure here must never block the
 * language from flipping on screen.
 */
export async function POST(req: Request) {
  /*
   * Signed-out visitors flip the language on the marketing pages too, and
   * there is no profile to write for them. That is the common case, not an
   * error — answer 401 and keep it out of the error logs.
   */
  let userId: string;
  try {
    ({ userId } = await getCurrentAgentContext());
  } catch {
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { locale?: unknown };
    const locale = String(body.locale ?? "");
    if (!(SUPPORTED_LOCALES as readonly string[]).includes(locale)) {
      return NextResponse.json(
        { ok: false, error: "Unsupported locale." },
        { status: 400 },
      );
    }

    const { error } = await supabaseAdmin
      .from("user_profiles")
      .update({ ui_language: locale })
      .eq("user_id", userId);
    if (error) throw error;

    return NextResponse.json({ ok: true, locale });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 },
    );
  }
}
