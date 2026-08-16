import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("getSiteUrl / getOAuthRedirectOrigin", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("normalizes NEXT_PUBLIC_SITE_URL without scheme", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "www.propertytoolsai.com";
    const { getSiteUrl } = await import("./siteUrl");
    expect(getSiteUrl()).toBe("https://www.propertytoolsai.com");
  });

  it("getOAuthRedirectOrigin uses window when env unset (client)", async () => {
    vi.stubGlobal("window", { location: { origin: "http://localhost:3001" } });
    // NODE_ENV is typed readonly, so a plain assignment does not typecheck.
    vi.stubEnv("NODE_ENV", "development");
    const { getOAuthRedirectOrigin } = await import("./siteUrl");
    expect(getOAuthRedirectOrigin()).toBe("http://localhost:3001");
  });

  it("getOAuthRedirectOrigin uses browser tab origin even when NEXT_PUBLIC_SITE_URL points elsewhere", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    vi.stubGlobal("window", { location: { origin: "http://localhost:3001" } });
    const { getOAuthRedirectOrigin } = await import("./siteUrl");
    expect(getOAuthRedirectOrigin()).toBe("http://localhost:3001");
  });
});
