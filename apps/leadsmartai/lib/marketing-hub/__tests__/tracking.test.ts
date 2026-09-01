import { describe, expect, it } from "vitest";

import {
  PIXEL_MIN_PLAN,
  decideTracking,
  hasPrivacySignal,
  isValidGaMeasurementId,
  isValidMetaPixelId,
  normalizeGaMeasurementId,
} from "@/lib/marketing-hub/tracking";

const CONFIGURED = { metaPixelId: "123456789012345", gaMeasurementId: "G-ABC1234567" };

describe("id validation", () => {
  it("accepts real Meta pixel ids", () => {
    expect(isValidMetaPixelId("123456789012345")).toBe(true); // 15
    expect(isValidMetaPixelId("1234567890123456")).toBe(true); // 16
    expect(isValidMetaPixelId(" 123456789012345 ")).toBe(true);
  });

  it("rejects what a person is likely to paste by mistake", () => {
    // A malformed tag fails SILENTLY in the browser — it loads, reports
    // nothing, and the agent concludes the feature is broken.
    expect(isValidMetaPixelId("12345")).toBe(false);
    expect(isValidMetaPixelId("G-ABC1234567")).toBe(false); // GA id in the wrong box
    expect(isValidMetaPixelId("fbq('init', '123456789012345')")).toBe(false);
    expect(isValidMetaPixelId(null)).toBe(false);
  });

  it("accepts GA4 ids and normalises case", () => {
    expect(isValidGaMeasurementId("G-ABC1234567")).toBe(true);
    expect(isValidGaMeasurementId("g-abc1234567")).toBe(true);
    expect(normalizeGaMeasurementId("g-abc1234567")).toBe("G-ABC1234567");
  });

  it("rejects a Universal Analytics id, which GA4 tags cannot use", () => {
    expect(isValidGaMeasurementId("UA-12345678-1")).toBe(false);
    expect(isValidGaMeasurementId("123456789012345")).toBe(false);
  });
});

describe("decideTracking — the plan gate", () => {
  it("renders the pixel at the required tier and above", () => {
    for (const tier of ["premium", "signature", "team"] as const) {
      expect(decideTracking(CONFIGURED, tier, false).metaPixelId).toBe(CONFIGURED.metaPixelId);
    }
  });

  it("withholds the pixel below it", () => {
    for (const tier of ["free", "starter", "pro"] as const) {
      const d = decideTracking(CONFIGURED, tier, false);
      expect(d.metaPixelId).toBeNull();
      expect(d.pixelSuppressedBy).toBe("plan");
    }
  });

  it("keeps GA4 on EVERY tier, including free", () => {
    // Gating basic traffic reads as stingy beside every website builder, and
    // an agent who never buys an ad still wants to see their own visitors.
    for (const tier of ["free", "starter", "pro", "premium", "signature", "team"] as const) {
      expect(decideTracking(CONFIGURED, tier, false).gaMeasurementId).toBe("G-ABC1234567");
    }
  });

  it("gates at premium, as decided", () => {
    expect(PIXEL_MIN_PLAN).toBe("premium");
  });
});

describe("decideTracking — the privacy signal", () => {
  it("outranks a valid id on a paying plan", () => {
    const d = decideTracking(CONFIGURED, "signature", true);
    expect(d.metaPixelId).toBeNull();
    expect(d.pixelSuppressedBy).toBe("privacy_signal");
  });

  it("leaves GA4 alone — first-party measurement, not ad sharing", () => {
    expect(decideTracking(CONFIGURED, "signature", true).gaMeasurementId).toBe(
      "G-ABC1234567",
    );
  });

  it("reports the privacy signal rather than sending the agent hunting", () => {
    // An agent on the right plan with a correct id must not be told
    // "not configured" — they would go looking for a problem that is not there.
    const d = decideTracking(CONFIGURED, "premium", true);
    expect(d.pixelSuppressedBy).toBe("privacy_signal");
  });
});

describe("decideTracking — nothing configured", () => {
  it("says so, and renders nothing", () => {
    const d = decideTracking({ metaPixelId: null, gaMeasurementId: null }, "signature", false);
    expect(d.metaPixelId).toBeNull();
    expect(d.gaMeasurementId).toBeNull();
    expect(d.pixelSuppressedBy).toBe("not_configured");
  });

  it("drops a malformed id rather than emitting a broken tag", () => {
    const d = decideTracking(
      { metaPixelId: "nope", gaMeasurementId: "UA-1234-5" },
      "signature",
      false,
    );
    expect(d.metaPixelId).toBeNull();
    expect(d.gaMeasurementId).toBeNull();
    expect(d.pixelSuppressedBy).toBe("not_configured");
  });
});

describe("hasPrivacySignal", () => {
  const headers = (v: string | null) => ({ get: () => v });

  it("reads Sec-GPC: 1", () => {
    expect(hasPrivacySignal(headers("1"))).toBe(true);
  });

  it("is false for absent, 0 and anything else", () => {
    expect(hasPrivacySignal(headers(null))).toBe(false);
    expect(hasPrivacySignal(headers("0"))).toBe(false);
    expect(hasPrivacySignal(headers("true"))).toBe(false);
  });
});
