import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { findMatchingListings } from "@/lib/contacts/listings/listingSearch";
import { sendListingAlertDigest } from "@/lib/contacts/listings/alertEmail";
import type {
  AlertFrequency,
  SavedSearchCriteria,
} from "@/lib/contacts/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Saved-search matcher cron. For each active saved_search that's due
 * for alerting, run the AI house-search engine (Claude + web search),
 * diff against last_matched_listing_ids to suppress repeats, and queue
 * the digest email.
 *
 * Schedule (recommended): every hour.
 *   - "instant" searches: alerted when due + 1h window
 *   - "daily" searches: alerted once per 24h
 *   - "weekly": alerted once per 7d
 *   - "never": skipped entirely
 *
 * Per-run budget:
 *   - Each due search triggers one AI house-search (~30-60s, Opus +
 *     web search). The per-search alert_frequency + last_alerted_at
 *     throttle bounds how often each search actually runs — a "daily"
 *     search runs at most once per 24h regardless of how often the cron
 *     fires — so this stays cheap without a separate cache table.
 *
 * Auth: Bearer CRON_SECRET or Vercel cron signature.
 */

const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  "https://www.propertytoolsai.com";

function isAuthorized(req: Request): boolean {
  const authHeader = req.headers.get("authorization") ?? "";
  const vercelCron = req.headers.get("x-vercel-cron-signature");
  if (vercelCron) return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return authHeader === `Bearer ${secret}`;
}

function frequencyToIntervalMs(f: AlertFrequency): number | null {
  switch (f) {
    case "instant":
      return 60 * 60 * 1000; // 1h
    case "daily":
      return 24 * 60 * 60 * 1000;
    case "weekly":
      return 7 * 24 * 60 * 60 * 1000;
    case "never":
      return null;
  }
}

type SearchRow = {
  id: string;
  contact_id: string;
  agent_id: number | string | null;
  name: string;
  criteria: SavedSearchCriteria;
  alert_frequency: AlertFrequency;
  last_alerted_at: string | null;
  last_matched_listing_ids: string[];
};

type ContactRow = {
  id: string;
  first_name: string | null;
  email: string | null;
  do_not_contact_email: boolean;
};

function isDueForAlert(row: SearchRow, now: Date): boolean {
  const interval = frequencyToIntervalMs(row.alert_frequency);
  if (interval === null) return false;
  if (!row.last_alerted_at) return true;
  const lastMs = new Date(row.last_alerted_at).getTime();
  return now.getTime() - lastMs >= interval;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const runStart = now.getTime();

  let queriedSearches = 0;
  let emailsSent = 0;
  let skippedQuota = false;
  const errors: Array<{ searchId: string; msg: string }> = [];

  try {
    // Pull every active, emailing search — filter by due in code since
    // alert_frequency interval varies per row.
    const { data: rows, error } = await supabaseAdmin
      .from("contact_saved_searches")
      .select(
        "id,contact_id,agent_id,name,criteria,alert_frequency,last_alerted_at,last_matched_listing_ids",
      )
      .eq("is_active", true as never)
      .neq("alert_frequency", "never" as never)
      .limit(500);
    if (error) throw error;

    const due = ((rows ?? []) as SearchRow[]).filter((r) => isDueForAlert(r, now));

    for (const search of due) {
      if (skippedQuota) break;
      queriedSearches += 1;

      // 1. Run the AI house-search for this saved search's criteria.
      const match = await findMatchingListings(search.criteria);
      if (match.ok === false) {
        const reason = match.reason;
        // If the AI engine is unconfigured (e.g. ANTHROPIC_API_KEY not
        // set), every remaining search will fail the same way — stop the
        // run rather than grinding through them all.
        if (/ANTHROPIC_API_KEY|unavailable/i.test(reason)) {
          skippedQuota = true;
          errors.push({ searchId: search.id, msg: reason });
          break;
        }
        errors.push({ searchId: search.id, msg: reason });
        continue;
      }

      // 2. Dedup against previously-alerted listings
      const alreadyAlerted = new Set(search.last_matched_listing_ids ?? []);
      const newListings = match.listings.filter((l) => !alreadyAlerted.has(l.id));
      if (newListings.length === 0) {
        // Nothing new — still update last_alerted_at so we don't keep
        // re-checking this search within its frequency window.
        await supabaseAdmin
          .from("contact_saved_searches")
          .update({ last_alerted_at: now.toISOString() } as never)
          .eq("id", search.id);
        continue;
      }

      // 3. Load contact for email + opt-out check
      const { data: contactRow } = await supabaseAdmin
        .from("contacts")
        .select("id,first_name,email,do_not_contact_email")
        .eq("id", search.contact_id)
        .maybeSingle();
      const contact = contactRow as ContactRow | null;
      if (!contact?.email || contact.do_not_contact_email) {
        errors.push({ searchId: search.id, msg: "no_email_or_opted_out" });
        continue;
      }

      // 4. Send the digest
      try {
        await sendListingAlertDigest({
          to: contact.email,
          contactFirstName: contact.first_name,
          savedSearchId: search.id,
          savedSearchName: search.name,
          listings: newListings.slice(0, 5), // cap to 5 per email to keep it scannable
          publicBaseUrl: PUBLIC_BASE_URL,
          agentId: search.agent_id,
        });
        emailsSent += 1;
      } catch (e) {
        errors.push({
          searchId: search.id,
          msg: e instanceof Error ? e.message : "send_failed",
        });
        // Don't update last_alerted_at on send failure — retry next run.
        continue;
      }

      // 5. Update dedup state. Keep last 200 listing_ids to cap the
      // jsonb column size; older listings rotate out.
      const nextIds = [
        ...newListings.map((l) => l.id),
        ...Array.from(alreadyAlerted),
      ].slice(0, 200);
      await supabaseAdmin
        .from("contact_saved_searches")
        .update({
          last_alerted_at: now.toISOString(),
          last_matched_listing_ids: nextIds as never,
        } as never)
        .eq("id", search.id);

      // 6. Log a saved_search_match event so the scoring cron sees it.
      for (const l of newListings.slice(0, 5)) {
        await supabaseAdmin.from("contact_events").insert({
          contact_id: search.contact_id,
          agent_id: search.agent_id as never,
          event_type: "saved_search_match",
          source: "cron",
          payload: {
            saved_search_id: search.id,
            listing_id: l.id,
            listing_address: l.address,
            listing_price: l.price,
          } as never,
        } as never);
      }
    }

    return NextResponse.json({
      ok: true,
      queriedSearches,
      emailsSent,
      skippedQuota,
      errorCount: errors.length,
      errors: errors.slice(0, 10),
      durationMs: Date.now() - runStart,
    });
  } catch (e) {
    console.error("[cron/saved-search-matcher] fatal", e);
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Server error",
      },
      { status: 500 },
    );
  }
}
