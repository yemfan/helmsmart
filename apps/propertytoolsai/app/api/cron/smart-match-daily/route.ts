import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import { findPropertyMatches, parseMatchPreferences } from "@/lib/match/findMatches";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function authorize(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

/**
 * Daily digest for subscribed Smart Match searches.
 * Schedule via Vercel Cron or similar: GET /api/cron/smart-match-daily
 */
export async function GET(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    // contact_saved_searches, not lead_saved_searches. The legacy table was
    // dropped during the leads -> contacts migration and the API route that
    // writes saved searches was updated to match — this cron was not, so it
    // has failed every morning since with PGRST205 (table not found) and no
    // saved-search alert has gone out.
    //
    // Columns were renamed with it: lead_id -> contact_id, preferences ->
    // criteria, last_sent_at -> last_alerted_at.
    const { data: rows, error } = await supabaseAdmin
      .from("contact_saved_searches")
      .select("id, contact_id, criteria, last_alerted_at, is_active")
      .eq("is_active", true);

    if (error) throw error;

    const cutoff = Date.now() - 23 * 60 * 60 * 1000;
    const due =
      rows?.filter((r) => {
        if (!r.last_alerted_at) return true;
        return new Date(r.last_alerted_at).getTime() < cutoff;
      }) ?? [];

    let sent = 0;

    for (const row of due) {
      const prefsRaw = row.criteria;
      const prefs = parseMatchPreferences(prefsRaw);
      if (!prefs) continue;

      const { data: leadRow } = await supabaseAdmin
        .from("leads")
        .select("email, name")
        .eq("id", row.contact_id)
        .maybeSingle();

      const to = leadRow?.email?.trim();
      if (!to) continue;

      const { matches } = await findPropertyMatches(prefs);
      const top = matches.slice(0, 3);
      if (!top.length) continue;

      const lines = top.map((m) => `- ${m.address} — $${m.price.toLocaleString()}`).join("\n");
      const greeting = leadRow?.name?.trim() || "there";
      const body = `Hi ${greeting},

Here are new homes matching your preferences:

${lines}

Want to see more or schedule a tour? Reply to this email.`;

      await sendEmail({
        to,
        subject: "New homes matching your search",
        text: body,
      });

      await supabaseAdmin
        .from("contact_saved_searches")
        .update({ last_alerted_at: new Date().toISOString() })
        .eq("id", row.id);

      sent += 1;
    }

    return NextResponse.json({ ok: true, processed: due.length, emailsSent: sent });
  } catch (e) {
    console.error("smart-match-daily cron", e);
    return NextResponse.json({ ok: false, error: "Cron failed" }, { status: 500 });
  }
}
