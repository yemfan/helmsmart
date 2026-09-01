import { describe, expect, it } from "vitest";
import {
  cachedSystem,
  markTranscriptCached,
  readCacheUsage,
  type LooseMessage,
} from "../promptCache";

describe("cachedSystem", () => {
  it("marks the system prompt as a breakpoint", () => {
    const [block] = cachedSystem("You are a valuation assistant.");
    expect(block).toEqual({
      type: "text",
      text: "You are a valuation assistant.",
      cache_control: { type: "ephemeral" },
    });
  });
});

describe("markTranscriptCached", () => {
  const assistantTurn = () => ({
    role: "assistant",
    content: [
      { type: "server_tool_use", id: "a" },
      { type: "web_search_tool_result", content: "…20k tokens of results…" },
      { type: "text", text: "Two comps found." },
    ] as Record<string, unknown>[],
  });

  it("puts the breakpoint on the last block of the last turn", () => {
    const messages: LooseMessage[] = [{ role: "user", content: "find comps" }, assistantTurn()];
    markTranscriptCached(messages);
    const blocks = messages[1].content as Record<string, unknown>[];
    expect(blocks[2].cache_control).toEqual({ type: "ephemeral" });
    expect(blocks[0].cache_control).toBeUndefined();
    expect(blocks[1].cache_control).toBeUndefined();
  });

  it("MOVES the breakpoint rather than leaving a trail", () => {
    // The API allows four breakpoints. A loop that added one per round would
    // blow that within a few searches, so each call must clear the last.
    const messages: LooseMessage[] = [{ role: "user", content: "find comps" }];
    for (let round = 0; round < 6; round++) {
      messages.push(assistantTurn());
      markTranscriptCached(messages);
    }
    const marked = messages
      .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
      .filter((b) => b.cache_control);
    expect(marked).toHaveLength(1);
    // and it is on the newest turn
    const newest = messages[messages.length - 1].content as Record<string, unknown>[];
    expect(newest[newest.length - 1].cache_control).toBeDefined();
  });

  it("leaves a plain string turn alone", () => {
    // Nothing to attach to, and the opening user message is too short to cache.
    const messages: LooseMessage[] = [{ role: "user", content: "find comps" }];
    expect(() => markTranscriptCached(messages)).not.toThrow();
    expect(messages[0].content).toBe("find comps");
  });

  it("does nothing on an empty transcript", () => {
    expect(() => markTranscriptCached([])).not.toThrow();
  });

  it("skips a turn whose content array is empty", () => {
    const messages: LooseMessage[] = [{ role: "assistant", content: [] }];
    expect(() => markTranscriptCached(messages)).not.toThrow();
  });
});

describe("readCacheUsage", () => {
  it("reads the three numbers that matter", () => {
    expect(
      readCacheUsage({
        cache_creation_input_tokens: 12980,
        cache_read_input_tokens: 15749,
        input_tokens: 17,
      }),
    ).toEqual({ written: 12980, read: 15749, uncached: 17 });
  });

  it("treats a response without cache fields as no cache use", () => {
    expect(readCacheUsage({ input_tokens: 400 })).toEqual({ written: 0, read: 0, uncached: 400 });
    expect(readCacheUsage(undefined)).toEqual({ written: 0, read: 0, uncached: 0 });
  });
});
