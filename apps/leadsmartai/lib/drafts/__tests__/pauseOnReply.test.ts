import { describe, expect, it } from "vitest";
import { isPausedOnReply, pausedUntil } from "../pauseOnReply";

const now = new Date("2026-08-28T15:00:00Z");

describe("isPausedOnReply", () => {
  it("holds a queued message back when they replied today", () => {
    expect(isPausedOnReply("2026-08-28T14:00:00Z", 3, now)).toBe(true);
  });

  it("releases it once the window has passed", () => {
    expect(isPausedOnReply("2026-08-20T14:00:00Z", 3, now)).toBe(false);
  });

  it("treats the boundary as expired", () => {
    // Exactly three days later is the moment the pause ends, not a moment more.
    expect(isPausedOnReply("2026-08-25T15:00:00Z", 3, now)).toBe(false);
  });

  it("does not pause a contact who has never written to us", () => {
    expect(isPausedOnReply(null, 3, now)).toBe(false);
    expect(isPausedOnReply(undefined, 3, now)).toBe(false);
  });

  it("does nothing when the agent has turned the window off", () => {
    expect(isPausedOnReply("2026-08-28T14:00:00Z", 0, now)).toBe(false);
    expect(isPausedOnReply("2026-08-28T14:00:00Z", -1, now)).toBe(false);
  });

  it("ignores an unparseable timestamp rather than pausing forever", () => {
    expect(isPausedOnReply("not a date", 3, now)).toBe(false);
  });
});

describe("pausedUntil", () => {
  it("reports when the queue resumes", () => {
    expect(pausedUntil("2026-08-28T14:00:00Z", 3)?.toISOString()).toBe(
      "2026-08-31T14:00:00.000Z",
    );
  });

  it("has no answer without a reply", () => {
    expect(pausedUntil(null, 3)).toBeNull();
  });
});
