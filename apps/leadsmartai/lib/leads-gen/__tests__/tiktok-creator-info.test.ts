import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { brandedContentConflict, enforceAgainstCreatorInfo, isPrivacyLevel } = await import(
  "../tiktok-creator-info"
);

type Info = Parameters<typeof enforceAgainstCreatorInfo>[1];
type Prefs = Parameters<typeof enforceAgainstCreatorInfo>[0];

const info = (over: Partial<Info> = {}): Info => ({
  nickname: "Test Creator",
  username: "testcreator",
  avatarUrl: null,
  privacyLevelOptions: ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"],
  commentDisabled: false,
  duetDisabled: false,
  stitchDisabled: false,
  maxVideoPostDurationSec: 600,
  ...over,
});

const prefs = (over: Partial<Prefs> = {}): Prefs => ({
  privacyLevel: "PUBLIC_TO_EVERYONE",
  disableComment: false,
  disableDuet: false,
  disableStitch: false,
  brandOrganic: false,
  brandContent: false,
  confirmedAt: "2026-08-24T00:00:00.000Z",
  ...over,
});

describe("isPrivacyLevel", () => {
  it("accepts the four TikTok levels and nothing else", () => {
    for (const v of ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"]) {
      expect(isPrivacyLevel(v)).toBe(true);
    }
    for (const v of ["PUBLIC", "public_to_everyone", "", null, undefined, 3, {}]) {
      expect(isPrivacyLevel(v)).toBe(false);
    }
  });
});

describe("enforceAgainstCreatorInfo — consent", () => {
  it("refuses to post when nobody has chosen an audience", () => {
    const r = enforceAgainstCreatorInfo(prefs({ privacyLevel: null, confirmedAt: null }), info());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/chosen how this TikTok account should post/i);
  });

  it("refuses when a level was stored but never confirmed by a human", () => {
    // The stored value alone is not consent — a migration default or a stray
    // write must not be treated as the creator having picked.
    const r = enforceAgainstCreatorInfo(prefs({ confirmedAt: null }), info());
    expect(r.ok).toBe(false);
  });

  it("never invents a default audience", () => {
    const r = enforceAgainstCreatorInfo(prefs({ privacyLevel: null, confirmedAt: null }), info());
    expect(r.ok).toBe(false);
    // The important part: no postInfo at all, rather than a "safe" fallback.
    expect(r).not.toHaveProperty("postInfo");
  });

  it("posts the creator's choice when they have made one", () => {
    const r = enforceAgainstCreatorInfo(prefs({ privacyLevel: "SELF_ONLY" }), info());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.postInfo.privacy_level).toBe("SELF_ONLY");
  });
});

describe("enforceAgainstCreatorInfo — the account's current state wins", () => {
  it("refuses a level TikTok no longer offers this account", () => {
    const r = enforceAgainstCreatorInfo(
      prefs({ privacyLevel: "PUBLIC_TO_EVERYONE" }),
      info({ privacyLevelOptions: ["SELF_ONLY"] }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/no longer allows/i);
  });

  it("does not quietly downgrade to an allowed level", () => {
    // Silently posting SELF_ONLY when the creator asked for public would be a
    // surprise; silently posting public when they asked for private would be
    // worse. Refuse and tell them.
    const r = enforceAgainstCreatorInfo(
      prefs({ privacyLevel: "PUBLIC_TO_EVERYONE" }),
      info({ privacyLevelOptions: ["SELF_ONLY"] }),
    );
    expect(r.ok).toBe(false);
  });

  it("keeps comments off when the ACCOUNT has them off, whatever is stored", () => {
    const r = enforceAgainstCreatorInfo(prefs({ disableComment: false }), info({ commentDisabled: true }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.postInfo.disable_comment).toBe(true);
  });

  it("keeps duet and stitch off when the account has them off", () => {
    const r = enforceAgainstCreatorInfo(
      prefs({ disableDuet: false, disableStitch: false }),
      info({ duetDisabled: true, stitchDisabled: true }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.postInfo.disable_duet).toBe(true);
      expect(r.postInfo.disable_stitch).toBe(true);
    }
  });

  it("honours the creator's own restriction even when the account allows it", () => {
    const r = enforceAgainstCreatorInfo(
      prefs({ disableComment: true, disableDuet: true, disableStitch: true }),
      info({ commentDisabled: false, duetDisabled: false, stitchDisabled: false }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.postInfo.disable_comment).toBe(true);
      expect(r.postInfo.disable_duet).toBe(true);
      expect(r.postInfo.disable_stitch).toBe(true);
    }
  });

  it("only ever makes interactions MORE restricted, never less", () => {
    for (const stored of [true, false]) {
      for (const account of [true, false]) {
        const r = enforceAgainstCreatorInfo(
          prefs({ disableComment: stored }),
          info({ commentDisabled: account }),
        );
        if (r.ok) expect(r.postInfo.disable_comment).toBe(stored || account);
      }
    }
  });
});

describe("branded content", () => {
  it("cannot be posted privately", () => {
    expect(brandedContentConflict({ privacyLevel: "SELF_ONLY", brandContent: true })).toMatch(
      /cannot be posted privately/i,
    );
  });

  it("is fine on any non-private audience", () => {
    for (const lvl of ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR"] as const) {
      expect(brandedContentConflict({ privacyLevel: lvl, brandContent: true })).toBeNull();
    }
  });

  it("does not restrict a private post that is not branded", () => {
    expect(brandedContentConflict({ privacyLevel: "SELF_ONLY", brandContent: false })).toBeNull();
  });

  it("blocks the publish, not just the form", () => {
    const r = enforceAgainstCreatorInfo(
      prefs({ privacyLevel: "SELF_ONLY", brandContent: true }),
      info(),
    );
    expect(r.ok).toBe(false);
  });

  it("passes both disclosure toggles through when they are set", () => {
    const r = enforceAgainstCreatorInfo(prefs({ brandOrganic: true, brandContent: true }), info());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.postInfo.brand_organic_toggle).toBe(true);
      expect(r.postInfo.brand_content_toggle).toBe(true);
    }
  });
});
