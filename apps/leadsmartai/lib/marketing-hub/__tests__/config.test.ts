import { describe, expect, it } from "vitest";
import {
  actionHref,
  defaultHubConfig,
  heroCtasToRender,
  mergeHubConfig,
  normalizeHubConfig,
  servicesToRender,
  socialLinks,
  toolKeysToRender,
  validateHubConfig,
} from "../config";

describe("normalizeHubConfig", () => {
  it("returns the defaults for nothing at all", () => {
    const cfg = normalizeHubConfig(null);
    expect(cfg).toEqual(defaultHubConfig());
    expect(cfg.assistant.enabled).toBe(true);
    expect(cfg.leadCapture.bookingMode).toBe("auto");
  });

  it("keeps a valid section and resets only the broken one", () => {
    const cfg = normalizeHubConfig({
      hero: { headline: "Hello", ctas: [{ label: "Go", action: { kind: "home_value" } }] },
      services: { items: [{ id: "x", icon: "not-an-icon" }] },
    });
    expect(cfg.hero.headline).toBe("Hello");
    expect(cfg.hero.ctas[0].action.kind).toBe("home_value");
    // The bad service list falls back to the default (empty) list — the
    // hero is untouched.
    expect(cfg.services.items).toEqual([]);
  });

  it("drops unknown keys", () => {
    const cfg = normalizeHubConfig({ hero: { headline: "x", secret: "y" }, junk: 1 });
    expect((cfg.hero as Record<string, unknown>).secret).toBeUndefined();
    expect((cfg as Record<string, unknown>).junk).toBeUndefined();
  });

  it("rejects a social url that is not http(s)", () => {
    const cfg = normalizeHubConfig({ social: { facebook: "javascript:alert(1)" } });
    // Whole section invalid → default (all null). Never a script: URL on the page.
    expect(cfg.social.facebook).toBeNull();
  });
});

describe("validateHubConfig", () => {
  it("reports the path of a problem", () => {
    const r = validateHubConfig({ hero: { headline: "x".repeat(200) } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems[0].path).toBe("hero.headline");
  });
});

describe("mergeHubConfig", () => {
  it("replaces one section and leaves the rest", () => {
    const base = normalizeHubConfig({ hero: { headline: "A" }, seo: { noindex: true } });
    const next = mergeHubConfig(base, { hero: { ...base.hero, headline: "B" } });
    expect(next.hero.headline).toBe("B");
    expect(next.seo.noindex).toBe(true);
  });
});

describe("render helpers", () => {
  it("uses default services until the agent saves, then respects an empty list", () => {
    const cfg = defaultHubConfig();
    expect(servicesToRender(cfg, false).length).toBeGreaterThan(0);
    expect(servicesToRender(cfg, true)).toEqual([]);
    expect(toolKeysToRender(cfg, false)).toContain("home_value");
    expect(toolKeysToRender(cfg, true)).toEqual([]);
  });

  it("falls back to default hero CTAs", () => {
    expect(heroCtasToRender(defaultHubConfig())).toHaveLength(3);
  });

  it("lists only the social networks that are set", () => {
    const cfg = normalizeHubConfig({ social: { instagram: "https://instagram.com/x", x: null } });
    expect(socialLinks(cfg)).toEqual([{ network: "instagram", url: "https://instagram.com/x" }]);
  });

  it("resolves CTA hrefs and returns null when a channel is missing", () => {
    const ctx = { username: "michaelye", phone: "(626) 555-0100", email: null, externalBookingUrl: null };
    expect(actionHref({ kind: "home_value", url: null }, ctx)).toBe("/@michaelye/home-value");
    expect(actionHref({ kind: "find_home", url: null }, ctx)).toBe("/homes?agent=michaelye");
    expect(actionHref({ kind: "call", url: null }, ctx)).toBe("tel:6265550100");
    expect(actionHref({ kind: "email", url: null }, ctx)).toBeNull();
    expect(actionHref({ kind: "book", url: null }, { ...ctx, externalBookingUrl: "https://cal.com/x" })).toBe(
      "https://cal.com/x",
    );
  });
});
