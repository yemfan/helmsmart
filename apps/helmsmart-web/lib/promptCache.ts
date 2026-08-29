/**
 * Prompt caching for HelmSmart's tool loops.
 *
 * A tool loop — plan, call a tool, observe, repeat — re-sends the system
 * prompt, every tool definition and the whole transcript on EVERY round. One
 * customer question is therefore several API calls, each paying full input
 * price for the same prefix. For the web-search loops the transcript IS the
 * search results, so a loop with `max_uses: 3` can pay for its early results
 * three times over.
 *
 * A cache breakpoint makes the rounds after the first read that prefix from
 * cache instead of re-billing it. Nothing about the conversation changes; only
 * what it costs to repeat it. Measured on a comparable loop in leadsmartai:
 * rounds after the first fell ~80%, a 3-round question fell 48% overall.
 *
 * Two breakpoints, well inside the API's limit of four:
 *
 *   1. the system prompt — identical on every call. The cached prefix runs
 *      tools -> system -> messages, so this covers the tool definitions too.
 *   2. the transcript, MOVED forward each round so round N reads rounds
 *      1..N-1 from cache.
 *
 * The transcript breakpoint has to be MOVED, not added: leaving one behind
 * every round exhausts the limit of four within a few tool calls.
 *
 * Caching is a no-op below the model's minimum cacheable prefix (~1024 tokens),
 * silently and harmlessly. The first round costs slightly MORE — a cache write
 * bills at 1.25x — so this is worth it for loops and repeated calls, and not
 * for a genuine one-shot that never comes back.
 *
 * ---
 * Deliberately a local copy rather than an import. The equivalent lives in
 * `@leadsmart/shared/utils/promptCache`, but that package carries real-estate
 * types (lead intent, valuation confidence, home-value estimates) and HelmSmart
 * core is meant to stay industry-agnostic. Sixty lines of pure, dependency-free
 * code is the cheaper price. If the two products ever gain a shared
 * infrastructure package, this belongs there and the twin should go with it.
 */

export type CacheControl = { type: "ephemeral" };

export const EPHEMERAL: CacheControl = { type: "ephemeral" };

export type CacheableTextBlock = {
  type: "text";
  text: string;
  cache_control?: CacheControl;
};

export type LooseBlock = Record<string, unknown>;

export type LooseMessage = {
  role: string;
  content: string | LooseBlock[];
};

/** The system prompt as a single cached block. */
export function cachedSystem(text: string): CacheableTextBlock[] {
  return [{ type: "text", text, cache_control: EPHEMERAL }];
}

/** Strip every breakpoint we previously placed in the transcript. */
function clearTranscriptBreakpoints(messages: LooseMessage[]): void {
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue;
    for (const block of message.content) {
      if (block && typeof block === "object" && "cache_control" in block) {
        delete (block as LooseBlock).cache_control;
      }
    }
  }
}

/**
 * Move the transcript breakpoint to the end of what has been said so far.
 *
 * Call it before each request, so the round about to run reads everything
 * before it from cache.
 *
 * A string `content` is left alone — there is no block to attach to. That
 * matters: a loop whose LAST message is a bare string gets no breakpoint at
 * all, silently. Push `content: [{ type: "text", text }]` instead of a raw
 * string anywhere the transcript may end.
 */
export function markTranscriptCached(messages: LooseMessage[]): void {
  clearTranscriptBreakpoints(messages);

  const last = messages[messages.length - 1];
  if (!last || !Array.isArray(last.content) || last.content.length === 0) return;

  const lastBlock = last.content[last.content.length - 1];
  if (lastBlock && typeof lastBlock === "object") {
    (lastBlock as LooseBlock).cache_control = EPHEMERAL;
  }
}

/** What a response reported about cache use. */
export type CacheUsage = {
  written: number;
  read: number;
  uncached: number;
};

export function readCacheUsage(usage: unknown): CacheUsage {
  const u = (usage ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    written: num(u.cache_creation_input_tokens),
    read: num(u.cache_read_input_tokens),
    uncached: num(u.input_tokens),
  };
}

/**
 * Total context tokens for one call — cached or not.
 *
 * With caching, `input_tokens` reports only the UNCACHED remainder. Anything
 * counting context (a budget, a guard, a "tokens used" figure) must add the
 * cached parts back or it silently shrinks by the size of the cached prefix.
 */
export function totalContextTokens(usage: unknown): number {
  const { uncached, read, written } = readCacheUsage(usage);
  return uncached + read + written;
}
