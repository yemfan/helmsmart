import { describe, expect, it } from "vitest";
import { cleanContent, isDuplicate, memoryPromptBlock, parseExtractedNotes } from "../pure";

describe("Max memory — pure helpers", () => {
  it("treats punctuation and case variants as the same note", () => {
    expect(isDuplicate("Always text Mrs. Chen after 5pm.", ["always text mrs chen after 5pm"])).toBe(true);
    expect(isDuplicate("Never show homes on Sundays", ["Always text Mrs. Chen after 5pm"])).toBe(false);
    // Nothing left after cleaning is "already known" — never an empty row.
    expect(isDuplicate("  ...  ", [])).toBe(true);
  });

  it("cleans whitespace and caps length without rejecting", () => {
    expect(cleanContent("  two   words \n here ")).toBe("two words here");
    expect(cleanContent("x".repeat(1000)).length).toBe(400);
    expect(cleanContent(42)).toBe("");
  });

  it("parses the extraction reply even when it is wrapped, and drops junk", () => {
    const text =
      'Here you go:\n```json\n[{"kind":"preference","content":"Never schedule showings on Sundays."},' +
      '{"kind":"nonsense","content":"Lists Rosewood at $1.2M."},{"content":"x"},"str",null]\n```';
    expect(parseExtractedNotes(text)).toEqual([
      { kind: "preference", content: "Never schedule showings on Sundays." },
      { kind: "fact", content: "Lists Rosewood at $1.2M." },
    ]);
    expect(parseExtractedNotes("[]")).toEqual([]);
    expect(parseExtractedNotes("no json here")).toEqual([]);
    expect(parseExtractedNotes('{"kind":"fact","content":"an object, not an array"}')).toEqual([]);
  });

  it("caps extraction at three notes", () => {
    const five = JSON.stringify(Array.from({ length: 5 }, (_, i) => ({ kind: "fact", content: `Note number ${i} here` })));
    expect(parseExtractedNotes(five)).toHaveLength(3);
  });

  it("emits no prompt block when there is nothing to remember", () => {
    expect(memoryPromptBlock([])).toBe("");
    const block = memoryPromptBlock([{ kind: "person", content: "My Rosewood seller is Grace Bennett.", created_at: "2026-09-06" }]);
    expect(block).toContain("[person] My Rosewood seller is Grace Bennett.");
    expect(block).toContain("remember_note");
    expect(block).toContain("forget_note");
  });
});
