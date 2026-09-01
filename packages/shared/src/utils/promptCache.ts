/**
 * Prompt caching for the search-and-answer loops.
 *
 * These calls bill about eighteen input tokens for every output token, and it
 * is not because Claude writes a lot. It is a `pause_turn` loop: each round
 * re-sends the system prompt, the tool definitions and every previous assistant
 * turn — and those turns contain the web-search results, which are the bulk of
 * the payload. A call with `max_uses: 5` therefore pays for its early search
 * results up to five times over.
 *
 * A cache breakpoint makes the rounds after the first read that prefix from
 * cache instead of re-billing it at full price. Nothing about the conversation
 * changes; only what it costs to repeat it.
 *
 * Two breakpoints, well under the API's limit of four:
 *
 *   1. the system prompt, which is identical on every call;
 *   2. the transcript so far, moved forward each round so that round N reads
 *      rounds 1..N-1 from cache.
 *
 * The moving breakpoint has to be MOVED, not added: leaving one behind on every
 * round would blow the limit of four within a few searches. Caching is also a
 * no-op below the model's minimum cacheable prefix (~1024 tokens), which is
 * silent and harmless — a short prompt simply does not get cached.
 *
 * The default ephemeral TTL is five minutes, which is the right horizon here:
 * the win is *within* one loop, where rounds are seconds apart. It does not
 * help a daily cron whose runs are hours apart, and this does not pretend to.
 */

export type CacheControl = { type: "ephemeral" };

export type CacheableTextBlock = {
  type: "text";
  text: string;
  cache_control?: CacheControl;
};

/** A message content block, as loosely as the SDK's unions allow. */
export type LooseBlock = Record<string, unknown>;

export type LooseMessage = {
  role: string;
  content: string | LooseBlock[];
};

export const EPHEMERAL: CacheControl = { type: "ephemeral" };

/**
 * The system prompt as a single cached block.
 *
 * The cached prefix covers the tool definitions too — they are sent ahead of
 * the system prompt — so this one breakpoint covers everything that never
 * varies between calls.
 */
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
 * Call it after appending the assistant turn and before the next request, so
 * the round about to run reads everything before it from cache.
 *
 * A string `content` is left alone: there is nothing to attach a breakpoint to,
 * and the first user message is short enough that it would not be cached anyway.
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

/** What a response reported about cache use, for logging. */
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
