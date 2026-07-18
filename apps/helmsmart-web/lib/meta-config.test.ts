import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/crypto", () => ({ encrypt: (s: string) => s, decrypt: (s: string) => s }));

const { getMetaConfig, metaAuthUrl } = await import("./meta");

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
});

describe("Meta OAuth redirect URI", () => {
  // Verticals are host-routed (www.helmsmart.ai, doctor.helmsmart.ai). A FIXED
  // redirect URI breaks OAuth on every pack subdomain, and it fails as
  // "bad_state" — which reads like a CSRF attack rather than a config bug, so
  // it would burn real debugging time.
  it("follows the host the user is actually on", () => {
    expect(getMetaConfig("www.helmsmart.ai").redirectUri).toBe(
      "https://www.helmsmart.ai/api/auth/meta/callback",
    );
    expect(getMetaConfig("doctor.helmsmart.ai").redirectUri).toBe(
      "https://doctor.helmsmart.ai/api/auth/meta/callback",
    );
  });

  it("keeps a pack user inside their own vertical", () => {
    // Sending a doctor.* user back to www.* would drop the state cookie AND
    // dump them in the wrong product.
    const { baseUrl } = getMetaConfig("doctor.helmsmart.ai");
    expect(baseUrl).toBe("https://doctor.helmsmart.ai");
  });

  it("uses http only for localhost", () => {
    expect(getMetaConfig("localhost:3002").redirectUri).toMatch(/^http:\/\/localhost:3002\//);
    expect(getMetaConfig("helmsmart.ai").redirectUri).toMatch(/^https:\/\//);
  });

  it("falls back to the configured app URL when there's no host", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://fallback.test";
    expect(getMetaConfig(null).redirectUri).toBe(
      "https://fallback.test/api/auth/meta/callback",
    );
  });

  it("honours an explicit override as a single-domain escape hatch", () => {
    process.env.META_OAUTH_REDIRECT_URI = "https://pinned.test/api/auth/meta/callback";
    expect(getMetaConfig("doctor.helmsmart.ai").redirectUri).toBe(
      "https://pinned.test/api/auth/meta/callback",
    );
  });

  it("sends the SAME redirect_uri to the authorize call", () => {
    // Meta compares authorize vs token-exchange exactly; a mismatch is rejected.
    process.env.META_APP_ID = "app123";
    const url = new URL(metaAuthUrl("nonce", "doctor.helmsmart.ai"));
    expect(url.searchParams.get("redirect_uri")).toBe(
      getMetaConfig("doctor.helmsmart.ai").redirectUri,
    );
    expect(url.searchParams.get("state")).toBe("nonce");
    expect(url.searchParams.get("client_id")).toBe("app123");
  });

  it("asks for the scopes publishing actually needs", () => {
    process.env.META_APP_ID = "app123";
    const scope = new URL(metaAuthUrl("n", "www.helmsmart.ai")).searchParams.get("scope") ?? "";
    // Page publishing + IG publishing. Missing any one of these produces a
    // permissions error at publish time, long after the user connected.
    for (const s of [
      "pages_show_list",
      "pages_manage_posts",
      "instagram_basic",
      "instagram_content_publish",
    ]) {
      expect(scope).toContain(s);
    }
  });
});
