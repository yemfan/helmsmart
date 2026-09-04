import { supabaseServer } from "@/lib/supabaseServer";
import { TRAFFIC_CITIES } from "@/lib/trafficSeo";
import { planRefreshTargets } from "@/lib/market/refreshPlan";
import { runPooled } from "@/lib/market/refreshPool";

export type CityDataTrend = "up" | "down" | "stable";

export type CityMarketData = {
  city: string;
  state: string;
  median_price: number;
  price_per_sqft: number;
  trend: CityDataTrend;
  days_on_market: number;
  inventory: number;
  source: string;
  ai_market_summary: string;
  ai_seller_recommendation: string;
  last_fetched_at: string;
  expires_at: string;
};

function toTitleCase(input: string) {
  return input
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function hashNumber(input: string) {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) h = (h * 33 + input.charCodeAt(i)) >>> 0;
  return h;
}

export function normalizeCityState(inputCity: string, inputState?: string) {
  const rawCity = String(inputCity ?? "").trim();
  const rawState = String(inputState ?? "").trim();
  if (!rawCity) return { city: "", state: "" };

  /*
   * Split an inline "City, ST" WHETHER OR NOT a state was also passed.
   *
   * The `&& !rawState` this used to carry meant that supplying both -- which
   * the get_market_snapshot schema openly invites, with a city described as
   * "City name, optionally 'City, ST'" beside an optional state -- skipped the
   * split entirely and looked up the literal string "Walnut, Ca". No row
   * matches that, so the tool reported "no cached market data yet" for a city
   * whose row was sitting right there. A false "we have nothing" is worse than
   * a lookup miss: it sends the agent off to do work already done.
   *
   * The explicit argument wins when the two disagree; it was chosen
   * deliberately, whereas the suffix is often just how someone typed it.
   */
  if (rawCity.includes(",")) {
    const [c, s] = rawCity.split(",").map((v) => v.trim());
    const state = (rawState || s || "").toUpperCase();
    return { city: toTitleCase(c), state };
  }

  const matched = TRAFFIC_CITIES.find(
    (c) =>
      c.slug === rawCity.toLowerCase() ||
      c.city.toLowerCase() === rawCity.toLowerCase()
  );
  if (matched) {
    return {
      city: matched.city,
      state: rawState ? rawState.toUpperCase() : matched.state,
    };
  }

  return { city: toTitleCase(rawCity), state: rawState.toUpperCase() };
}

function deriveTrend(yoyPct: number): CityDataTrend {
  if (yoyPct > 1) return "up";
  if (yoyPct < -1) return "down";
  return "stable";
}

function buildFallbackCityData(city: string, state: string) {
  const matched = TRAFFIC_CITIES.find(
    (c) => c.city.toLowerCase() === city.toLowerCase() && c.state === state
  );
  if (matched) {
    return {
      city: matched.city,
      state: matched.state,
      median_price: matched.median_price,
      price_per_sqft: matched.price_per_sqft,
      trend: matched.trend as CityDataTrend,
      days_on_market: matched.trend === "up" ? 24 : matched.trend === "down" ? 52 : 36,
      inventory: matched.trend === "up" ? 1450 : matched.trend === "down" ? 2450 : 1925,
      source: "seed",
      raw_payload: matched,
    };
  }

  const h = hashNumber(`${city}|${state}`);
  const median = 300000 + (h % 700000);
  const ppsf = 175 + (h % 500);
  const trendValue = ((h % 1200) - 300) / 100;
  const trend = deriveTrend(trendValue);

  return {
    city,
    state,
    median_price: median,
    price_per_sqft: ppsf,
    trend,
    days_on_market: trend === "up" ? 26 : trend === "down" ? 58 : 39,
    inventory: 1200 + (h % 2400),
    source: "fallback",
    raw_payload: { seeded: true },
  };
}

async function generateAIInsight(input: {
  city: string;
  state: string;
  median_price: number;
  price_per_sqft: number;
  trend: CityDataTrend;
  days_on_market: number;
  inventory: number;
}) {
  const fallbackSummary = `${input.city}, ${input.state} is currently ${input.trend} with median prices near $${Math.round(
    input.median_price
  ).toLocaleString()} and about ${input.days_on_market} days on market.`;
  const fallbackRecommendation =
    input.trend === "up"
      ? "Seller recommendation: price competitively and launch quickly while buyer demand is active."
      : input.trend === "down"
      ? "Seller recommendation: focus on condition, strategic pricing, and flexible terms to protect proceeds."
      : "Seller recommendation: use fresh comps and a clear launch timeline to stand out in a balanced market.";

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { ai_market_summary: fallbackSummary, ai_seller_recommendation: fallbackRecommendation };
  }

  try {
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const prompt = `Generate concise JSON for a real-estate SEO page.\nCity: ${input.city}, ${input.state}\nmedian_price: ${input.median_price}\nprice_per_sqft: ${input.price_per_sqft}\ntrend: ${input.trend}\ndays_on_market: ${input.days_on_market}\ninventory: ${input.inventory}\nReturn JSON object with keys: market_summary, seller_recommendation. Max 2 sentences each.`;
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        messages: [
          { role: "system", content: "You are a concise local real-estate analyst." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      return { ai_market_summary: fallbackSummary, ai_seller_recommendation: fallbackRecommendation };
    }
    const json = (await res.json()) as any;
    const content = String(json?.choices?.[0]?.message?.content ?? "").trim();
    const parsed = content ? JSON.parse(content) : {};
    const normalizeText = (value: any, fallback: string) => {
      if (typeof value === "string") return value.trim() || fallback;
      if (Array.isArray(value)) {
        const t = value.map((v) => (typeof v === "string" ? v : JSON.stringify(v))).join(" ");
        return t.trim() || fallback;
      }
      if (value && typeof value === "object") {
        const nested = (value.summary ?? value.text ?? value.content ?? value.message) as any;
        if (typeof nested === "string" && nested.trim()) return nested.trim();
        const city = String((value as any).city ?? "").trim();
        const trend = String((value as any).trend ?? "").trim();
        const median = Number((value as any).median_price ?? 0);
        const dom = Number((value as any).days_on_market ?? 0);
        if (city && trend && median > 0 && dom > 0) {
          return `${city} is ${trend} with a median price near $${Math.round(
            median
          ).toLocaleString()} and average market time around ${Math.round(dom)} days.`;
        }
        try {
          const json = JSON.stringify(value);
          return json.length > 2 ? json : fallback;
        } catch {
          return fallback;
        }
      }
      return fallback;
    };
    return {
      ai_market_summary: normalizeText(parsed.market_summary, fallbackSummary),
      ai_seller_recommendation: normalizeText(parsed.seller_recommendation, fallbackRecommendation),
    };
  } catch {
    return { ai_market_summary: fallbackSummary, ai_seller_recommendation: fallbackRecommendation };
  }
}

export async function getCityData(options: {
  city: string;
  state?: string;
  forceRefresh?: boolean;
  maxAgeHours?: number;
}) {
  const normalized = normalizeCityState(options.city, options.state);
  if (!normalized.city || !normalized.state) {
    throw new Error("city and state are required");
  }

  const maxAgeHours = Math.max(1, Math.min(168, Number(options.maxAgeHours ?? 24)));
  const nowIso = new Date().toISOString();
  const staleBeforeIso = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString();

  const { data: existing, error: existingError } = await supabaseServer
    .from("city_market_data")
    .select(
      "city,state,median_price,price_per_sqft,trend,days_on_market,inventory,source,ai_market_summary,ai_seller_recommendation,last_fetched_at,expires_at"
    )
    .eq("city", normalized.city)
    .eq("state", normalized.state)
    .maybeSingle();
  if (existingError && (existingError as any).code !== "PGRST116") throw existingError;

  const isFresh =
    !!existing &&
    !options.forceRefresh &&
    new Date(String((existing as any).expires_at ?? 0)).getTime() > Date.now() &&
    new Date(String((existing as any).last_fetched_at ?? 0)).toISOString() > staleBeforeIso;
  if (isFresh) return existing as CityMarketData;

  // Market numbers: try a live AI web_search fetch first (replaces the seed-
  // only numbers curated after RentCast removal), and fall back to seed data
  // when the AI is unavailable or returns nothing. Cached 24h (city_market_data)
  // and driven by the daily refreshAllCitiesDaily cron, so the AI cost is
  // bounded. The OpenAI market summary below is unaffected.
  let baseData = buildFallbackCityData(normalized.city, normalized.state);
  let fetched = false;
  let fetchError: string | null = null;
  try {
    const { aiMarketStats } = await import("@repo/valuation/server");
    const statsResult = await aiMarketStats(normalized.city, normalized.state);
    if (!statsResult.ok) fetchError = statsResult.error ?? `status ${statsResult.status}`;
    else if (statsResult.stats.medianPrice == null && statsResult.stats.pricePerSqft == null)
      fetchError = "no median or price/sqft in response";
    if (
      statsResult.ok &&
      (statsResult.stats.medianPrice != null || statsResult.stats.pricePerSqft != null)
    ) {
      const stats = statsResult.stats;
      baseData = {
        city: normalized.city,
        state: normalized.state,
        median_price: stats.medianPrice ?? baseData.median_price,
        price_per_sqft: stats.pricePerSqft ?? baseData.price_per_sqft,
        trend: stats.trend,
        days_on_market: stats.daysOnMarket ?? baseData.days_on_market,
        inventory: stats.inventory ?? baseData.inventory,
        source: "ai_web_search",
        raw_payload: stats as unknown,
      } as typeof baseData;
      fetched = true;
    }
  } catch (e: any) {
    fetchError = String(e?.message ?? "import or call threw");
  }

  /*
   * A failed fetch must not be written back as a fresh row.
   *
   * It used to be: the `catch` fell through to the seed constants, and the
   * upsert below stamped them `last_fetched_at: now`. So a fetch that never
   * happened produced a row indistinguishable from one that did — Los Angeles
   * carrying the 955000 from `trafficSeo.ts`, dated today. Every one of the
   * 394 rows was in that state and `source = 'ai_web_search'` had none, which
   * is why nobody could see it: the failure manufactured its own evidence of
   * success.
   *
   * Two shapes, and neither writes a timestamp it did not earn:
   *
   *   - a row already exists: leave it exactly as it is. Overwriting it with
   *     seed numbers would also destroy a good earlier reading, and letting
   *     its age keep growing is what makes the oldest-first plan and the
   *     cron's `remaining` count mean something;
   *   - no row exists: return the fallback without persisting it. The table
   *     stops accumulating rows whose median is a hash of the city name.
   */
  if (!fetched) {
    console.warn(
      `[city-data] fetch failed for ${normalized.city}, ${normalized.state}: ${fetchError ?? "unknown"}`,
    );
    // An existing row keeps its own numbers, summary and age. Nothing to add.
    if (existing) return existing as CityMarketData;
  }

  const ai = await generateAIInsight(baseData);

  const upsertPayload = {
    city: normalized.city,
    state: normalized.state,
    median_price: Number(baseData.median_price ?? 0),
    price_per_sqft: Number(baseData.price_per_sqft ?? 0),
    trend: baseData.trend,
    days_on_market: Math.max(0, Math.round(Number(baseData.days_on_market ?? 0))),
    inventory: Math.max(0, Math.round(Number(baseData.inventory ?? 0))),
    source: String(baseData.source ?? "fallback"),
    raw_payload: baseData.raw_payload ?? {},
    ai_market_summary: ai.ai_market_summary,
    ai_seller_recommendation: ai.ai_seller_recommendation,
    last_fetched_at: nowIso,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    updated_at: nowIso,
  };

  /*
   * Render it, but do not record it. The caller still gets a shaped object so
   * the SEO pages have something to draw; what it does not get is a row in the
   * table asserting that this city was looked up today.
   */
  if (!fetched) return upsertPayload as unknown as CityMarketData;

  const { data: saved, error: saveError } = await supabaseServer
    .from("city_market_data")
    .upsert(upsertPayload, { onConflict: "city,state" })
    .select(
      "city,state,median_price,price_per_sqft,trend,days_on_market,inventory,source,ai_market_summary,ai_seller_recommendation,last_fetched_at,expires_at"
    )
    .single();
  if (saveError) throw saveError;
  return saved as CityMarketData;
}

/**
 * Refresh the markets we hold data for, oldest first, within a time budget.
 *
 * This used to walk TRAFFIC_CITIES and nothing else. Those 117 metros were
 * immaculate — and the other 277 rows in `city_market_data` had never been
 * refreshed once, because `getCityData` writes a row for any market an agent
 * asks about and nothing ever came back for it. 267 of them were over 90 days
 * old while every seed city was under 30. The markets an agent looks up are
 * the ones they work in, so the data most likely to be quoted to a seller was
 * the data guaranteed to rot.
 *
 * `planRefreshTargets` merges the seed list with the table and sorts by
 * staleness. The budget then matters: 394 AI web-search calls do not fit in
 * one invocation, and a run that always started at the top of a fixed list
 * would refresh the same prefix forever. Oldest-first makes a partial run
 * progress rather than churn — what this run leaves behind is next run's
 * head of the queue.
 *
 * What that left unsaid was how long a cycle takes. A market is one AI
 * web-search call; two measured against production took 25.9s and 40.7s. One
 * at a time inside the budget is about seven markets a run, and against 394
 * markets a weekly cron is a fifty-four WEEK cycle — for data the app calls
 * stale after thirty days. The queue was draining two orders of magnitude
 * slower than the threshold it is judged by, which no ordering can fix.
 *
 * So the run works four markets at once (see refreshPool.ts) and the cron
 * moved to daily. Neither alone is enough: daily and sequential is still a
 * ~54-day cycle. Together it is about a fortnight, inside the threshold with
 * room for the calls that fail.
 */
export async function refreshAllCitiesDaily(
  options: { budgetMs?: number; concurrency?: number } = {},
) {
  // Leave headroom under the route's maxDuration so the last city in flight
  // can finish and the response still gets written; a killed invocation
  // reports nothing at all, which is how this went unnoticed for months.
  const budgetMs = Math.max(10_000, options.budgetMs ?? 240_000);
  const concurrency = Math.max(1, Math.min(8, options.concurrency ?? 4));

  const { data: rows } = await supabaseServer
    .from("city_market_data")
    .select("city,state,last_fetched_at");

  const targets = planRefreshTargets(
    TRAFFIC_CITIES.map((c) => ({ city: c.city, state: c.state })),
    ((rows ?? []) as Array<{ city: string; state: string; last_fetched_at: string | null }>).map(
      (r) => ({ city: r.city, state: r.state, lastFetchedAt: r.last_fetched_at }),
    ),
  );

  let fellBack = 0;
  const errors: Array<{ city: string; state: string; error: string }> = [];

  const report = await runPooled(
    targets,
    async (target) => {
      const row = await getCityData({
        city: target.city,
        state: target.state,
        forceRefresh: true,
        maxAgeHours: 24,
      });
      /*
       * Not every non-throwing call fetched anything. `getCityData` falls back
       * to seed constants when the AI lookup fails, and this used to count
       * that as a success — which is how it reported `failed: 0` while 117 of
       * 117 markets went unfetched for months. The row's own source is the
       * only honest evidence that a lookup happened.
       */
      if (row?.source !== "ai_web_search") fellBack += 1;
    },
    { concurrency, budgetMs, now: () => Date.now() },
  );

  for (const outcome of report.outcomes) {
    if (outcome.ok) continue;
    errors.push({
      city: outcome.item.city,
      state: outcome.item.state,
      error: String((outcome.error as any)?.message ?? "Unknown error"),
    });
  }
  const failed = errors.length;

  return {
    processed: report.processed,
    failed,
    /*
     * Fetched, not merely visited. `fellBack` above zero means the AI lookup
     * is not working and the numbers behind it are placeholders, whatever the
     * timestamps say.
     */
    fetched: report.processed - failed - fellBack,
    fellBack,
    succeeded: report.processed - failed,
    concurrency,
    // `remaining` is the number to watch: while it stays above zero the
    // schedule is not keeping up with the table, and saying so in the cron's
    // own response is cheaper than noticing months later in a bug report.
    remaining: report.remaining,
    total: targets.length,
    errors: errors.slice(0, 20),
  };
}
