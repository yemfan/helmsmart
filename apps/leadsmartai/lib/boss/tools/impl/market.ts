import "server-only";

import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeCityState } from "@/lib/cityDataEngine";
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
    const row = data as { median_price: number | null; trend: string | null };
    return {
      status: "completed",
      summary: `Market snapshot for ${city}, ${state}: median $${Number(row.median_price ?? 0).toLocaleString()}, trend ${row.trend ?? "n/a"}.`,
      data: { found: true, snapshot: data },
    };
  },
});
