/**
 * Whether a cached city market snapshot is fit to repeat to a person.
 *
 * `get_market_snapshot` handed Max whatever the row held and let him narrate
 * it. Two things were wrong with that, and both reached agents:
 *
 *   - a null median printed as `median $0`, with `found: true` beside it. In
 *     one real run Max reported "Walnut, CA: median $0, trend stable", noticed
 *     it was nonsense, and filed a bug against us — which is the system working
 *     only because the model happened to be sceptical;
 *   - nothing carried a DATE. A figure cached in March was narrated in
 *     September in the present tense.
 *
 * Neither is hypothetical at the current data: of 394 rows, 241 have no usable
 * median and 267 were last fetched more than 90 days ago. So the common case
 * for this tool is data that should not be stated as current fact, and an
 * agent may well repeat it to a seller.
 *
 * The rule is deliberately conservative: a missing number is reported as
 * missing rather than guessed, and a number that IS usable travels with its
 * age so the caveat cannot be dropped on the way to the client.
 *
 * Age is necessary and not sufficient. A figure can be zero days old and still
 * not be a measurement: when the AI fetch fails, `getCityData` writes the seed
 * constants back with `last_fetched_at = now`, so the row LOOKS freshly
 * observed. At the time of writing every one of the 394 rows was like that —
 * `source = 'ai_web_search'` had no rows at all, and Los Angeles held 955000,
 * the literal typed into `trafficSeo.ts`. `median $0` was caught because zero
 * is obviously wrong; 955000 is not, and that is the more dangerous shape.
 * So a figure must also come from a source that represents a real lookup.
 *
 * Pure, so the thresholds are covered by tests rather than by reading prose.
 */

/** Beyond this, a cached figure is labelled rather than stated plainly. */
export const STALE_AFTER_DAYS = 30;

/**
 * Sources that mean "we went and looked". Everything else is a placeholder.
 *
 * An allowlist, not a denylist of the placeholders we know about today
 * (`seed`, `fallback`, `seed_socal_county_json`, `seed_socal_county_pipeline`,
 * and `rentcast`, a vendor retired in #790-797 whose last row is from June).
 * The two fail in opposite directions: an unknown source under a denylist gets
 * quoted to a seller, and under an allowlist gets muted until someone adds it.
 * Muting a real new vendor is loud and gets fixed in an afternoon; quoting a
 * new brand of placeholder is silent, which is exactly how this survived.
 *
 * Same reasoning as treating an undated row as stale: we cannot show it is a
 * measurement, so we do not talk as if it were.
 */
export const MEASURED_SOURCES = new Set(["ai_web_search"]);

export type SnapshotRow = {
  median_price?: number | null;
  trend?: string | null;
  last_fetched_at?: string | null;
  source?: string | null;
};

export type SnapshotVerdict = {
  /** A median we are willing to put in a sentence, or null. */
  medianPrice: number | null;
  /** True when the row is a placeholder rather than a lookup. */
  unmeasured: boolean;
  /** Whole days since the row was fetched; null when the row has no date. */
  ageDays: number | null;
  /** True when the figure is usable but old enough to need saying so. */
  stale: boolean;
};

export function judgeSnapshot(row: SnapshotRow, now: Date = new Date()): SnapshotVerdict {
  const raw = row.median_price;
  /*
   * Non-positive is missing, not cheap. Zero is the value a broken import
   * leaves behind, and it is indistinguishable from a real answer once it has
   * been formatted with a dollar sign.
   */
  const positive =
    typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : null;

  /*
   * A placeholder is withheld at ANY age. Staleness is the wrong instrument
   * here: a seed row refreshed an hour ago is zero days old and still not a
   * measurement, so a caveat about its age would be true and beside the point.
   */
  const unmeasured = !MEASURED_SOURCES.has(String(row.source ?? ""));
  const medianPrice = unmeasured ? null : positive;

  const fetched = row.last_fetched_at ? new Date(row.last_fetched_at) : null;
  const ageDays =
    fetched && !Number.isNaN(fetched.getTime())
      ? Math.max(0, Math.floor((now.getTime() - fetched.getTime()) / 86_400_000))
      : null;

  /*
   * An undated row is treated as stale. We cannot show it is current, and the
   * cost of over-caveating a fresh figure is far below the cost of stating a
   * six-month-old one as today's market.
   */
  const stale = medianPrice !== null && (ageDays === null || ageDays > STALE_AFTER_DAYS);

  return { medianPrice, unmeasured, ageDays, stale };
}
