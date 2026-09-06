import { NextResponse } from "next/server";

import { fetchCampaignInsights } from "@/lib/leads-gen/meta-ads";
import { decryptToken } from "@/lib/leads-gen/token-enc";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
// Meta /insights can take 10-15s on a busy campaign; a batch of 20 fits.
export const maxDuration = 300;

/**
 * Hourly: pull Meta insights for every active lead-ad campaign.
 *
 * Until now ad numbers moved only when an agent pressed Refresh on the
 * campaign list, so the Marketing Hub's analytics would have shown week-old
 * spend beside hour-old post metrics. Same shape as refresh-post-metrics:
 * a bounded batch, oldest-refreshed first, one failure never stops the rest.
 */

const BATCH_LIMIT = 20;
const MIN_REFRESH_INTERVAL_MINUTES = 55;

function authorize(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

type CampaignRow = {
  id: string;
  agent_id: number;
  social_account_id: string;
  meta_campaign_id: string;
  metrics_refreshed_at: string | null;
};

export async function GET(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - MIN_REFRESH_INTERVAL_MINUTES * 60_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("lead_ad_campaigns")
    .select("id, agent_id, social_account_id, meta_campaign_id, metrics_refreshed_at")
    .eq("status", "active")
    .not("meta_campaign_id", "is", null)
    .or(`metrics_refreshed_at.is.null,metrics_refreshed_at.lt.${cutoff}`)
    .order("metrics_refreshed_at", { ascending: true, nullsFirst: true })
    .limit(BATCH_LIMIT);

  if (error) {
    console.error("[cron/refresh-ad-metrics] select failed:", error.message);
    return NextResponse.json({ ok: false, error: "read_failed" }, { status: 500 });
  }

  const rows = (data ?? []) as CampaignRow[];
  let refreshed = 0;
  let skipped = 0;
  let failed = 0;

  for (const camp of rows) {
    try {
      const { data: conn } = await supabaseAdmin
        .from("social_accounts")
        .select("user_access_token_enc, status")
        .eq("id", camp.social_account_id)
        .eq("agent_id", camp.agent_id)
        .maybeSingle();
      const c = conn as { user_access_token_enc: string | null; status: string } | null;
      if (!c || c.status !== "connected" || !c.user_access_token_enc) {
        skipped++;
        continue;
      }
      const token = decryptToken(c.user_access_token_enc);
      const insights = await fetchCampaignInsights({ metaCampaignId: camp.meta_campaign_id, userAccessToken: token });
      const nowIso = new Date().toISOString();
      const update: Record<string, unknown> = { metrics_refreshed_at: nowIso, updated_at: nowIso };
      if (insights) update.metrics = insights;
      await supabaseAdmin.from("lead_ad_campaigns").update(update).eq("id", camp.id);
      refreshed++;
    } catch (e) {
      failed++;
      console.warn(`[cron/refresh-ad-metrics] campaign ${camp.id}:`, e instanceof Error ? e.message : e);
    }
  }

  return NextResponse.json({ ok: true, candidates: rows.length, refreshed, skipped, failed });
}
