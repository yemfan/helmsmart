import { describe, expect, it } from "vitest";

import {
  cachedSystem,
  markTranscriptCached,
  readCacheUsage,
  totalContextTokens,
  type LooseMessage,
} from "./promptCache";

/**
 * HelmSmart had three uncached tool loops — the SMS receptionist, the voice
 * receptionist and the social research loop — each re-sending the system
 * prompt, every tool schema and the whole transcript on every round. These pin
 * the behaviour that makes caching work, and the two ways it silently doesn't.
 */

function breakpoints(messages: LooseMessage[]): number {
  let n = 0;
  for (const m of messages) {
    if (!Array.isArray(m.content)) continue;
    for (const b of m.content) if (b && typeof b === "object" && "cache_control" in b) n += 1;
  }
  return n;
}

describe("cachedSystem", () => {
  it("wraps the prompt in a single ephemeral block", () => {
    expect(cachedSystem("you are Emma")).toEqual([
      { type: "text", text: "you are Emma", cache_control: { type: "ephemeral" } },
    ]);
  });
});

describe("markTranscriptCached", () => {
  it("marks the last block of the last message", () => {
    const messages: LooseMessage[] = [
      { role: "user", content: [{ type: "text", text: "hi" }] },
      { role: "assistant", content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] },
    ];
    markTranscriptCached(messages);
    const last = messages[1].content as Record<string, unknown>[];
    expect(last[1]).toHaveProperty("cache_control");
    expect(last[0]).not.toHaveProperty("cache_control");
  });

  it("MOVES the breakpoint rather than accumulating them", () => {
    // The API allows four. A five-round loop that left one behind each time
    // would exceed that and start failing outright.
    const messages: LooseMessage[] = [{ role: "user", content: [{ type: "text", text: "q" }] }];
    for (let round = 0; round < 5; round++) {
      markTranscriptCached(messages);
      expect(breakpoints(messages)).toBe(1);
      messages.push({ role: "assistant", content: [{ type: "text", text: `round ${round}` }] });
      messages.push({ role: "user", content: [{ type: "text", text: "search results..." }] });
    }
    markTranscriptCached(messages);
    expect(breakpoints(messages)).toBe(1);
  });

  it("places NOTHING when the transcript ends in a bare string", () => {
    // This is the trap, and the reason the loops now push text blocks: a
    // string has no block to attach to, so the call looks cached from every
    // angle except the bill.
    const messages: LooseMessage[] = [
      { role: "assistant", content: [{ type: "text", text: "long prior turn" }] },
      { role: "user", content: "write the post now" },
    ];
    markTranscriptCached(messages);
    expect(breakpoints(messages)).toBe(0);
  });

  it("works once that same message is sent as a block", () => {
    const messages: LooseMessage[] = [
      { role: "assistant", content: [{ type: "text", text: "long prior turn" }] },
      { role: "user", content: [{ type: "text", text: "write the post now" }] },
    ];
    markTranscriptCached(messages);
    expect(breakpoints(messages)).toBe(1);
  });

  it("does not throw on an empty transcript", () => {
    expect(() => markTranscriptCached([])).not.toThrow();
  });
});

describe("totalContextTokens", () => {
  // The SMS route reports tokensUsed and cost_cents from these. Counting only
  // the uncached remainder would make a cached loop look like it barely ran.
  it("adds cached reads and writes back in", () => {
    expect(
      totalContextTokens({
        input_tokens: 900,
        cache_read_input_tokens: 12_000,
        cache_creation_input_tokens: 600,
      }),
    ).toBe(13_500);
  });

  it("equals input_tokens when nothing was cached", () => {
    expect(totalContextTokens({ input_tokens: 4_200 })).toBe(4_200);
  });

  it("tolerates a missing or malformed usage object", () => {
    expect(totalContextTokens(null)).toBe(0);
    expect(totalContextTokens({ input_tokens: "many" })).toBe(0);
  });
});

describe("readCacheUsage", () => {
  it("reports all three counters", () => {
    expect(
      readCacheUsage({
        input_tokens: 10,
        cache_read_input_tokens: 20,
        cache_creation_input_tokens: 30,
      }),
    ).toEqual({ uncached: 10, read: 20, written: 30 });
  });

  it("defaults every counter to zero", () => {
    expect(readCacheUsage(undefined)).toEqual({ uncached: 0, read: 0, written: 0 });
  });
});
