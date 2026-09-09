import { NextResponse } from "next/server";

import { SUPPORTED_LOCALES } from "@/lib/i18n/config";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Persist the signed-in user's UI language.
 *
 * The language toggle writes a cookie and nothing else, so the choice would
 * live exclusively in one browser. Anything running WITHOUT a request — the
 * weekly digest, the insights cron, any generator run ahead of time — has no
 * way to learn it and would write English to a Chinese owner.
 * `user_preferences.ui_locale` is the durable copy those readers consult
 * (see lib/i18n/userLocale.ts).
 *
 * The cookie stays the fast path for rendering: it needs no round trip and
 * works signed out. Best-effort by design — a failure here must never block
 * the language from flipping on screen, which is why the client fires and
 * forgets.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  /*
   * Signed-out visitors flip the language on the marketing pages too, and
   * there is no row to write for them. That is the common case, not an
   * error — answer 401 and keep it out of the error logs.
   */
  if (!user) {
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { locale?: unknown };
  const locale = String(body.locale ?? "");
  if (!(SUPPORTED_LOCALES as readonly string[]).includes(locale)) {
    return NextResponse.json({ ok: false, error: "Unsupported locale." }, { status: 400 });
  }

  // Through the RLS client: ask for the row back so a refused write is
  // distinguishable from a saved one (see CLAUDE.md, "A save that reports
  // success must have changed a row").
  const { data, error } = await supabase
    .from("user_preferences")
    .upsert({ user_id: user.id, ui_locale: locale, updated_at: new Date().toISOString() })
    .select("user_id");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ ok: false, error: "Not saved." }, { status: 403 });
  }

  return NextResponse.json({ ok: true, locale });
}
