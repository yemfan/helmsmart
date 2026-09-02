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
 * Pure, so the thresholds are covered by tests rather than by reading prose.
 */

/** Beyond this, a cached figure is labelled rather than stated plainly. */
export const STALE_AFTER_DAYS = 30;

export type SnapshotRow = {
  median_price?: number | null;
  trend?: string | null;
  last_fetched_at?: string | null;
};

export type SnapshotVerdict = {
  /** A median we are willing to put in a sentence, or null. */
  medianPrice: number | null;
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
  const medianPrice =
    typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : null;

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

  return { medianPrice, ageDays, stale };
}
