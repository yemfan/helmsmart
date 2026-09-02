import "server-only";

import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeCityState } from "@/lib/cityDataEngine";
import { judgeSnapshot } from "@/lib/market/snapshotFreshness";
import { defineTool } from "../types";

export const getMarketSnapshot = defineTool({
  name: "get_market_snapshot",
  description:
    "Get the cached market snapshot for a city (median price, $/sqft, trend, days on market, inventory, AI summary). Read-only; data refreshes on its own cron.",
  inputSchema: z.object({
    city: z.string().min(2).describe("City name, optionally 'City, ST'"),
    state: z.string().length(2).optional().describe("Two-letter state code"),
  }),
  riskClass: "research",
  assignee: "sales_assistant",
  execute: async (_ctx, input) => {
    const { city, state } = normalizeCityState(input.city, input.state);
    const { data } = await supabaseAdmin
      .from("city_market_data")
      .select(
        "city, state, median_price, price_per_sqft, trend, days_on_market, inventory, ai_market_summary, ai_seller_recommendation, last_fetched_at",
      )
      .ilike("city", city)
      .ilike("state", state)
      .order("last_fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) {
      return {
        status: "completed",
        summary: `No cached market data for ${city}, ${state} yet.`,
        data: { found: false, city, state },
      };
    }
    const row = data as {
      median_price: number | null;
      trend: string | null;
      last_fetched_at: string | null;
    };
    const verdict = judgeSnapshot(row);

    /*
     * A null median used to print as `median $0` with `found: true` beside it,
     * and Max narrated that to the agent as the state of the market. Report
     * what is actually known instead: the trend still has value on its own.
     */
    if (verdict.medianPrice === null) {
      return {
        status: "completed",
        summary:
          `No median price on file for ${city}, ${state}` +
          (row.trend ? ` (trend ${row.trend}).` : ".") +
          " Do not quote a price for this market from cached data.",
        data: { found: true, medianPriceAvailable: false, snapshot: data },
      };
    }

    /*
     * Every figure travels with its age. Without one, a median cached in March
     * gets narrated in September in the present tense — and the agent may
     * repeat it to a seller.
     */
    const age = verdict.ageDays === null ? "date unknown" : `as of ${verdict.ageDays}d ago`;
    const caveat = verdict.stale
      ? " This figure is out of date — say so if you use it, and prefer live comps."
      : "";
    return {
      status: "completed",
      summary:
        `Market snapshot for ${city}, ${state}: median $${verdict.medianPrice.toLocaleString()}, ` +
        `trend ${row.trend ?? "n/a"} (${age}).${caveat}`,
      data: {
        found: true,
        medianPriceAvailable: true,
        ageDays: verdict.ageDays,
        stale: verdict.stale,
        snapshot: data,
      },
    };
  },
});
