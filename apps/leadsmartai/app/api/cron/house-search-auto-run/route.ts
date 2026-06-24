import { NextResponse } from "next/server";

import { verifyCronRequest } from "@/lib/cronAuth";
import { generateHouseSearch } from "@/lib/house-search/aiHouseSearch";
import { sendBuyerListings } from "@/lib/house-search/buyerEmail";
import {
  listDueAutoRunSearches,
  markAutoRunComplete,
  recordAutoRun,
} from "@/lib/house-search/savedHouseSearches";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
// Each auto-run is a live web search; process a few sequentially per tick.
export const maxDuration = 300;

/**
 * GET /api/cron/house-search-auto-run
 *
 * Agent-requested auto-run for saved AI House Searches. For each due search
 * (auto_run on, active, last_auto_run_at older than its daily/weekly interval):
 * re-run the buyer's brief, append an 'auto' run to its history, and email the
 * buyer ONLY the listings that are new since the previous run. Bounded per tick
 * (web search is slow); run on a several-times-a-day schedule to drain the rest.
 */
export async function GET(req: Request) {
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const due = await listDueAutoRunSearches(4);
  let processed = 0;
  let sent = 0;
  let skipped = 0;

  for (const s of due) {
    try {
      const { data: c } = await supabaseAdmin
        .from("contacts")
        .select("name, email")
        .eq("id", s.contactId)
        .maybeSingle();
      const email = String((c as { email?: string | null } | null)?.email ?? "").trim();
      const firstName = String((c as { name?: string | null } | null)?.name ?? "").split(/\s+/)[0] || null;

      const res = await generateHouseSearch(s.query, s.latestRefinements);
      if (res.ok) {
        await recordAutoRun(s.id, s.latestRefinements, res.result);

        // Only email listings the buyer hasn't seen in the previous run.
        const prev = new Set(s.latestListingKeys);
        const fresh = res.result.listings.filter((l) => {
          const k = (l.listingUrl || l.address || "").toLowerCase();
          return k.length > 0 && !prev.has(k);
        });

        if (email && fresh.length > 0) {
          await sendBuyerListings({
            to: email,
            buyerFirstName: firstName,
            listings: fresh,
            query: s.query,
            agentId: s.agentId,
            note: "New matches since your last update:",
          });
          sent += 1;
        } else {
          skipped += 1; // no email on file, or nothing new this run
        }
      } else {
        skipped += 1;
      }
      await markAutoRunComplete(s.id);
      processed += 1;
    } catch (e) {
      console.error("[house-search-auto-run] failed for", s.id, e);
      // Stamp it anyway so a persistently-failing search doesn't hot-loop.
      try {
        await markAutoRunComplete(s.id);
      } catch {
        /* ignore */
      }
    }
  }

  return NextResponse.json({ ok: true, due: due.length, processed, sent, skipped });
}
