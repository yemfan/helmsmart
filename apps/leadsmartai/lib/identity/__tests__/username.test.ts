import { describe, expect, it } from "vitest";

import {
  RESERVED_USERNAMES,
  USERNAME_MAX,
  USERNAME_MIN,
  checkUsername,
  displayUsername,
  isValidUsername,
  normalizeUsername,
  suggestUsername,
  usernameProblemMessage,
} from "@/lib/identity/username";

/**
 * A username reaches a URL, an email local part and a display handle, and is
 * close to irreversible once an agent starts using it. These pin the rules so
 * the three consumers cannot drift apart — and so the database CHECK and this
 * module keep agreeing, which is the pair most likely to diverge silently.
 */

describe("normalizeUsername", () => {
  it("strips the sigil — it is display, never data", () => {
    expect(normalizeUsername("@michaelye")).toBe("michaelye");
    expect(normalizeUsername("@@michaelye")).toBe("michaelye");
  });

  it("lowercases and trims", () => {
    expect(normalizeUsername("  MichaelYe ")).toBe("michaelye");
  });

  it("survives null and undefined", () => {
    expect(normalizeUsername(null)).toBe("");
    expect(normalizeUsername(undefined)).toBe("");
  });
});

describe("displayUsername", () => {
  it("adds the sigil back exactly once", () => {
    expect(displayUsername("michaelye")).toBe("@michaelye");
    expect(displayUsername("@michaelye")).toBe("@michaelye");
  });

  it("is empty rather than a lone @ when there is no name", () => {
    expect(displayUsername("")).toBe("");
    expect(displayUsername(null)).toBe("");
  });
});

describe("checkUsername", () => {
  it("accepts an ordinary handle", () => {
    expect(checkUsername("michaelye")).toBeNull();
    expect(checkUsername("@michaelye")).toBeNull();
    expect(checkUsername("michael-ye")).toBeNull();
    expect(checkUsername("michael_ye_2")).toBeNull();
  });

  it("rejects dots — Gmail folds them, so two agents would share one inbox", () => {
    // m.ichaelye and michaelye deliver to the same Gmail mailbox. Allowing
    // dots would let two people believe they own different addresses.
    expect(checkUsername("michael.ye")).toBe("bad_characters");
  });

  it("rejects spaces and symbols", () => {
    expect(checkUsername("michael ye")).toBe("bad_characters");
    expect(checkUsername("michael+ye")).toBe("bad_characters");
    expect(checkUsername("michael/ye")).toBe("bad_characters");
  });

  it("rejects leading and trailing hyphens, which break mail tooling", () => {
    expect(checkUsername("-michaelye")).toBe("bad_edges");
    expect(checkUsername("michaelye-")).toBe("bad_edges");
    expect(checkUsername("_michaelye")).toBe("bad_edges");
  });

  it("enforces the length band", () => {
    expect(checkUsername("ab")).toBe("too_short");
    expect(checkUsername("a".repeat(USERNAME_MIN))).toBeNull();
    expect(checkUsername("a".repeat(USERNAME_MAX))).toBeNull();
    expect(checkUsername("a".repeat(USERNAME_MAX + 1))).toBe("too_long");
  });

  it("treats an empty box as its own problem, not an invalid name", () => {
    expect(checkUsername("")).toBe("empty");
    expect(checkUsername("   ")).toBe("empty");
    expect(checkUsername("@")).toBe("empty");
  });

  it("blocks mail infrastructure names", () => {
    // postmaster and abuse are obliged to reach a human at the domain.
    expect(checkUsername("postmaster")).toBe("reserved");
    expect(checkUsername("abuse")).toBe("reserved");
    expect(checkUsername("noreply")).toBe("reserved");
  });

  it("blocks the company and its AI staff — this is the phishing surface", () => {
    // "@billing emailed me about my card" must be false by construction.
    expect(checkUsername("support")).toBe("reserved");
    expect(checkUsername("billing")).toBe("reserved");
    expect(checkUsername("closeboss")).toBe("reserved");
    expect(checkUsername("max")).toBe("reserved");
    expect(checkUsername("emma")).toBe("reserved");
  });

  it("blocks structural words so the URL space stays open", () => {
    expect(checkUsername("api")).toBe("reserved");
    expect(checkUsername("dashboard")).toBe("reserved");
    expect(checkUsername("admin")).toBe("reserved");
  });

  it("catches a reserved name typed with the sigil or in caps", () => {
    expect(checkUsername("@Support")).toBe("reserved");
    expect(checkUsername("  ADMIN ")).toBe("reserved");
  });

  it("reports the specific fault before the generic one", () => {
    // "ab" is short AND would fail the pattern; the message must say which
    // problem to fix, so length wins.
    expect(checkUsername("ab")).toBe("too_short");
  });
});

describe("reserved list", () => {
  it("contains only names that would themselves be valid", () => {
    // A reserved entry that could never be typed anyway is dead weight, and
    // usually a sign of a typo in the list.
    for (const name of RESERVED_USERNAMES) {
      expect(
        name.length >= USERNAME_MIN &&
          name.length <= USERNAME_MAX &&
          /^[a-z0-9][a-z0-9_-]*[a-z0-9]$/.test(name),
        `reserved name "${name}" is not a well-formed username`,
      ).toBe(true);
    }
  });

  it("covers the RFC 2142 mailboxes a domain must answer", () => {
    for (const required of ["postmaster", "abuse", "webmaster"]) {
      expect(RESERVED_USERNAMES.has(required)).toBe(true);
    }
  });
});

describe("usernameProblemMessage", () => {
  it("tells the person what to change, not merely that they are wrong", () => {
    expect(usernameProblemMessage("bad_characters")).toMatch(/letters, numbers/i);
    expect(usernameProblemMessage("reserved")).toMatch(/try/i);
    expect(usernameProblemMessage("too_short")).toContain(String(USERNAME_MIN));
  });

  it("has a message for every problem the checker can return", () => {
    const problems = [
      "empty", "too_short", "too_long", "bad_characters", "bad_edges", "reserved",
    ] as const;
    for (const p of problems) {
      expect(usernameProblemMessage(p).length).toBeGreaterThan(0);
    }
  });
});

describe("suggestUsername", () => {
  it("builds a handle from a name", () => {
    expect(suggestUsername({ firstName: "Michael", lastName: "Ye" })).toBe("michaelye");
  });

  it("falls back to the brand name", () => {
    expect(suggestUsername({ brandName: "Michael Ye Real Estate" })).toBe(
      "michaelyerealestate",
    );
  });

  it("drops accents and punctuation rather than emitting an invalid handle", () => {
    expect(isValidUsername(suggestUsername({ firstName: "José", lastName: "Núñez" }))).toBe(
      true,
    );
  });

  it("returns empty rather than something unusable", () => {
    // Never hand the form a value it would immediately reject.
    expect(suggestUsername({})).toBe("");
    expect(suggestUsername({ firstName: "Li" })).toBe("");
  });

  it("never suggests a reserved name uncorrected", () => {
    const s = suggestUsername({ brandName: "Support" });
    expect(s === "" || !RESERVED_USERNAMES.has(s)).toBe(true);
  });
});
