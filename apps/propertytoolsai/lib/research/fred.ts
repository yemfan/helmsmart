import "server-only";

/**
 * Minimal FRED (Federal Reserve Economic Data) client for the research engine.
 *
 * Reads FRED_API_KEY (free key from fredaccount.stlouisfed.org). When the key
 * is absent, every function returns null and the caller falls back to letting
 * Claude web_search Freddie Mac PMMS / FRED for the current numbers instead.
 *
 * We only need a few weekly series (30-yr / 15-yr fixed mortgage, 10-yr
 * Treasury) with a short trailing window to describe week-over-week movement.
 * Uses the global fetch — no new dependencies.
 */

/** A single dated observation from a FRED series. */
export type FredObservation = {
  date: string; // YYYY-MM-DD
  value: number;
};

/** Latest + trailing observations for one series. */
export type FredSeries = {
  seriesId: string;
  latest: FredObservation;
  observations: FredObservation[]; // newest-first, ~8 obs
};

/** Weekly rate series we care about for the mortgage-rate report. */
export type RateSeries = {
  mortgage30: FredSeries | null;
  mortgage15: FredSeries | null;
  treasury10: FredSeries | null;
  fetchedAt: string; // ISO timestamp
};

const FRED_SERIES = {
  mortgage30: "MORTGAGE30US",
  mortgage15: "MORTGAGE15US",
  treasury10: "DGS10",
} as const;

export function isFredConfigured(): boolean {
  return Boolean(process.env.FRED_API_KEY?.trim());
}

async function fetchSeries(seriesId: string, apiKey: string): Promise<FredSeries | null> {
  const url =
    `https://api.stlouisfed.org/fred/series/observations` +
    `?series_id=${encodeURIComponent(seriesId)}` +
    `&api_key=${encodeURIComponent(apiKey)}` +
    `&file_type=json&sort_order=desc&limit=8`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    const rawObs = (json as { observations?: unknown }).observations;
    if (!Array.isArray(rawObs)) return null;

    const observations: FredObservation[] = [];
    for (const o of rawObs) {
      const rec = o as { date?: unknown; value?: unknown };
      const date = typeof rec.date === "string" ? rec.date : null;
      // FRED emits "." for missing values — skip them.
      const valStr = typeof rec.value === "string" ? rec.value : null;
      if (!date || !valStr || valStr === ".") continue;
      const value = Number(valStr);
      if (!Number.isFinite(value)) continue;
      observations.push({ date, value });
    }

    if (observations.length === 0) return null;
    return { seriesId, latest: observations[0], observations };
  } catch {
    return null;
  }
}

/**
 * Fetch the latest + trailing ~8 weekly observations for the mortgage-rate
 * series. Returns null when FRED_API_KEY is unset (caller falls back to
 * web_search). When the key is present but a given series fails, that series
 * is null but the others are still returned.
 */
export async function getRateSeries(): Promise<RateSeries | null> {
  const apiKey = process.env.FRED_API_KEY?.trim();
  if (!apiKey) return null;

  const [mortgage30, mortgage15, treasury10] = await Promise.all([
    fetchSeries(FRED_SERIES.mortgage30, apiKey),
    fetchSeries(FRED_SERIES.mortgage15, apiKey),
    fetchSeries(FRED_SERIES.treasury10, apiKey),
  ]);

  // If every series failed, treat it as "no FRED" so the caller falls back.
  if (!mortgage30 && !mortgage15 && !treasury10) return null;

  return {
    mortgage30,
    mortgage15,
    treasury10,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Render the FRED rate series as a compact, human-readable ground-truth block
 * to hand to Claude. Each series lists newest-first observations so the model
 * can describe week-over-week movement without inventing numbers.
 */
export function formatRateSeriesForPrompt(rates: RateSeries): string {
  const lines: string[] = [
    "Ground-truth mortgage-rate data from FRED (Federal Reserve Economic Data), St. Louis Fed.",
    `Fetched: ${rates.fetchedAt}.`,
    "Series are averages published by Freddie Mac (PMMS) and the U.S. Treasury; use ONLY these numbers for the rates below — do not alter them.",
    "",
  ];

  const label: Record<keyof typeof FRED_SERIES, string> = {
    mortgage30: "30-Year Fixed Mortgage Average (MORTGAGE30US, % APR)",
    mortgage15: "15-Year Fixed Mortgage Average (MORTGAGE15US, % APR)",
    treasury10: "10-Year Treasury Constant Maturity (DGS10, %)",
  };

  (Object.keys(FRED_SERIES) as (keyof typeof FRED_SERIES)[]).forEach((key) => {
    const series = rates[key];
    if (!series) {
      lines.push(`${label[key]}: (unavailable)`);
      return;
    }
    const obs = series.observations
      .map((o) => `${o.date}=${o.value}`)
      .join(", ");
    lines.push(`${label[key]}: ${obs}`);
    lines.push(
      `  Source URL: https://fred.stlouisfed.org/series/${series.seriesId}`,
    );
  });

  return lines.join("\n");
}
