import { describe, expect, it, vi } from "vitest";

import {
  PLATFORMS,
  PUBLISHABLE_PLATFORMS,
  canPublish,
  outcomeForDuePost,
  patchSocialPost,
  providerFor,
  unsupportedReason,
} from "./social-platforms";

describe("publishable platforms", () => {
  it("only claims platforms we have a real publisher for", () => {
    // If a platform is added here, its publish path must actually work — this
    // list is what the UI promises and what the cron will attempt.
    expect([...PUBLISHABLE_PLATFORMS].sort()).toEqual(
      ["facebook", "instagram", "linkedin"].sort(),
    );
  });

  it("never claims a platform outside the schema's allowed set", () => {
    for (const p of PUBLISHABLE_PLATFORMS) expect(PLATFORMS).toContain(p);
  });

  it("still says no for X, which has no publisher", () => {
    // Facebook + Instagram graduated when their publishers landed. X did not,
    // so it stays honestly marked rather than silently accepting posts.
    expect(canPublish("x")).toBe(false);
    for (const p of ["linkedin", "facebook", "instagram"]) {
      expect(canPublish(p)).toBe(true);
    }
  });

  it("routes each platform to the OAuth provider that actually owns it", () => {
    // One Meta grant covers Facebook AND Instagram — connecting a Page enables
    // both, which is why they can't each have their own provider.
    expect(providerFor("facebook")).toBe("meta");
    expect(providerFor("instagram")).toBe("meta");
    expect(providerFor("linkedin")).toBe("linkedin");
    expect(providerFor("x")).toBeNull();
  });

  it("rejects unknown platforms rather than assuming they work", () => {
    for (const p of ["", "tiktok", "LINKEDIN", "linked in"]) {
      expect(canPublish(p)).toBe(false);
    }
  });

  it("explains the limit and what to do instead", () => {
    const reason = unsupportedReason("instagram");
    expect(reason).toContain("Instagram");
    // A refusal that doesn't say what to do next just moves the confusion.
    expect(reason.toLowerCase()).toMatch(/manual|copy/);
  });
});

describe("patchSocialPost", () => {
  /** Minimal supabase-ish stub: .from(...).update(patch).eq(...) → { error }. */
  function stubDb(errors: (unknown | null)[]) {
    const updates: Record<string, unknown>[] = [];
    let call = 0;
    const db = {
      from: () => ({
        update: (patch: Record<string, unknown>) => {
          updates.push(patch);
          const error = errors[call++] ?? null;
          return { eq: async () => ({ error }) };
        },
      }),
    };
    return { db, updates };
  }

  it("writes the patch as-is when the column exists", async () => {
    const { db, updates } = stubDb([null]);
    await patchSocialPost(db, "p1", { status: "failed", last_error: "nope" });
    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual({ status: "failed", last_error: "nope" });
  });

  it("still records the status when last_error hasn't been migrated yet", async () => {
    // The deploy window: new code live, migration 00078 not applied. Dropping
    // the whole write here would leave the post 'scheduled' — the exact silent
    // stall this change removes. Losing the REASON is acceptable; losing the
    // STATUS TRANSITION is not.
    const { db, updates } = stubDb([{ code: "PGRST204", message: "last_error not found" }]);
    await patchSocialPost(db, "p1", { status: "failed", last_error: "nope" });
    expect(updates).toHaveLength(2);
    expect(updates[1]).toEqual({ status: "failed" });
    expect(updates[1]).not.toHaveProperty("last_error");
  });

  it("does not swallow unrelated database errors", async () => {
    const { db } = stubDb([{ code: "23503", message: "foreign key violation" }]);
    await expect(
      patchSocialPost(db, "p1", { status: "failed", last_error: "x" }),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("retries only once, not in a loop", async () => {
    const { db, updates } = stubDb([
      { code: "PGRST204", message: "last_error not found" },
      { code: "PGRST204", message: "last_error not found" },
    ]);
    await patchSocialPost(db, "p1", { status: "failed", last_error: "x" });
    expect(updates).toHaveLength(2);
  });
});

describe("the scheduled-post decision", () => {
  // The cron's contract, stated as a property: EVERY due post must leave the
  // 'scheduled' state. Publishable ones get published; the rest get failed with
  // a reason. Nothing is allowed to stay queued and silent.
  it("resolves every platform to a terminal outcome", () => {
    const actions = PLATFORMS.map((p) => outcomeForDuePost(p).action);
    expect(actions).not.toContain("stay-scheduled");
    expect(actions.filter((a) => a === "attempt")).toHaveLength(
      PUBLISHABLE_PLATFORMS.length,
    );
    expect(actions.filter((a) => a === "fail")).toHaveLength(
      PLATFORMS.length - PUBLISHABLE_PLATFORMS.length,
    );
  });

  it("every failure carries a reason the author can act on", () => {
    for (const p of PLATFORMS) {
      const outcome = outcomeForDuePost(p);
      if (outcome.action === "fail") expect(outcome.reason.length).toBeGreaterThan(20);
    }
  });
});

vi.mock("server-only", () => ({}));
