/**
 * What the Boss loop should count against a run's token budget.
 *
 * Prompt caching splits a number that used to be whole. Before it, one call
 * reported `input_tokens` and that was the entire context. With a cache
 * breakpoint the same call reports only the UNCACHED remainder there, and puts
 * the rest in `cache_read_input_tokens` / `cache_creation_input_tokens`.
 *
 * `run.token_budget` is the guard against a loop that never terminates, and it
 * is spent using this figure. Handing it the uncached remainder alone would
 * shrink every reading by roughly the size of the cached prefix — the system
 * prompt and 27 tool schemas — and quietly let a run think several times longer
 * than its budget permits. Caching is meant to change what a run costs, not how
 * long it may run.
 *
 * So the budget keeps counting the whole context. That also keeps new rows in
 * `boss_runs` comparable with the ones written before caching existed, which is
 * the only way to tell afterwards whether any of this actually worked.
 *
 * Pure and free of `server-only` so the arithmetic can be tested directly.
 */

import { readCacheUsage } from "@leadsmart/shared/utils/promptCache";

/**
 * Total context tokens for one model call — cached or not.
 *
 * @param usage the `usage` object from an Anthropic response.
 */
export function totalContextTokens(usage: unknown): number {
  const { uncached, read, written } = readCacheUsage(usage);
  return uncached + read + written;
}

/**
 * How much of this call's context was served from cache, 0..1.
 *
 * Only for logging — it is the number that says whether the breakpoints are
 * actually landing. A loop that reports 0 round after round has breakpoints
 * that are being placed but never hit, which looks identical to working code
 * from every other angle.
 */
export function cacheHitRatio(usage: unknown): number {
  const { uncached, read, written } = readCacheUsage(usage);
  const total = uncached + read + written;
  return total === 0 ? 0 : read / total;
}
