import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// lib/threads.ts also carries publish/token helpers that pull in server-only +
// supabase + crypto; the OAuth-START logic under test needs none of them.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: vi.fn(), createClient: vi.fn() }));
vi.mock("@/lib/crypto", () => ({ encrypt: (s: string) => s, decrypt: (s: string) => s }));

import { threadsAuthorizeUrl, isThreadsConfigured, getThreadsConfig } from "./threads";

const ORIG = { ...process.env };
beforeEach(() => {
  process.env.THREADS_APP_ID = "test-app-id";
  process.env.THREADS_APP_SECRET = "test-secret";
  process.env.NEXT_PUBLIC_APP_URL = "https://helmsmart.example.com";
});
afterEach(() => {
  process.env = { ...ORIG };
});

describe("Connect Threads button — OAuth start contract", () => {
  it("is configured only when BOTH app id and secret are set", () => {
    expect(isThreadsConfigured()).toBe(true);
    delete process.env.THREADS_APP_SECRET;
    expect(isThreadsConfigured()).toBe(false);
    delete process.env.THREADS_APP_ID;
    expect(isThreadsConfigured()).toBe(false);
  });

  it("sends redirect_uri = our callback on the public app URL (must be whitelisted in Meta)", () => {
    expect(getThreadsConfig().redirectUri).toBe(
      "https://helmsmart.example.com/api/auth/threads/callback",
    );
  });

  it("builds a correct authorize URL: right host, scopes, and params", () => {
    const url = new URL(threadsAuthorizeUrl("nonce-123"));
    // The dialog is on threads.net, NOT facebook.com.
    expect(`${url.origin}${url.pathname}`).toBe("https://threads.net/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("test-app-id");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("threads_basic,threads_content_publish");
    expect(url.searchParams.get("state")).toBe("nonce-123");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://helmsmart.example.com/api/auth/threads/callback",
    );
  });
});
