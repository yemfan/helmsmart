import { supabaseServer } from "@/lib/supabaseServer";
import { TRAFFIC_CITIES } from "@/lib/trafficSeo";

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

  if (rawCity.includes(",") && !rawState) {
    const [c, s] = rawCity.split(",").map((v) => v.trim());
    return { city: toTitleCase(c), state: String(s ?? "").toUpperCase() };
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

  // Market numbers come from curated seed data (TRAFFIC_CITIES) + deterministic
  // fallback; the RentCast /v1/markets fetch was removed. The OpenAI market
  // summary below is unaffected.
  const baseData = buildFallbackCityData(normalized.city, normalized.state);
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

export async function refreshAllCitiesDaily() {
  let processed = 0;
  let failed = 0;
  const errors: Array<{ city: string; state: string; error: string }> = [];
  for (const city of TRAFFIC_CITIES) {
    processed += 1;
    try {
      await getCityData({
        city: city.city,
        state: city.state,
        forceRefresh: true,
        maxAgeHours: 24,
      });
    } catch (e: any) {
      failed += 1;
      errors.push({
        city: city.city,
        state: city.state,
        error: String(e?.message ?? "Unknown error"),
      });
    }
  }
  return { processed, failed, succeeded: processed - failed, errors };
}
