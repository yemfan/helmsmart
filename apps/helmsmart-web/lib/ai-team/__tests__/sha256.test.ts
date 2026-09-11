/** The card and the server hash with this; it must be SHA-256 exactly. */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "../sha256";

const reference = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

describe("sha256Hex", () => {
  it("matches node:crypto, across block boundaries and non-ASCII text", () => {
    const inputs = [
      "",
      "abc",
      "a".repeat(55),
      "a".repeat(56),
      "a".repeat(63),
      "a".repeat(64),
      "a".repeat(119),
      "x".repeat(1000),
      "Running 15 minutes late — sorry! 你好 🎉 ¿Mañana?",
      JSON.stringify(["approval-v1", "text_client", "aaaaaaaa-0000-4000-8000-000000000002", null, "(415) 555-0143", null, null, null, "hi"]),
    ];
    for (const s of inputs) expect(sha256Hex(s), JSON.stringify(s.slice(0, 20))).toBe(reference(s));
  });

  it("knows the published vector", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
