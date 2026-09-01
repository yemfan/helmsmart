import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: {} }));

const {
  agentFacingPinterestError,
  PINTEREST_TRIAL_ACCESS_CODE,
  PINTEREST_TRIAL_ACCESS_MESSAGE,
  parseMissingScopes,
} = await import("../pinterest-post");

/** The exact body Pinterest returned on 2026-08-29, after boards:write was granted. */
const TRIAL_BODY =
  "Apps with Trial access may not create Pins in production https://api.pinterest.com " +
  "- use API Sandbox https://api-sandbox.pinterest.com instead.";

describe("agentFacingPinterestError", () => {
  it("replaces the trial-access error with something an agent can act on", () => {
    const msg = agentFacingPinterestError(PINTEREST_TRIAL_ACCESS_CODE, TRIAL_BODY);
    expect(msg).toBe(PINTEREST_TRIAL_ACCESS_MESSAGE);
    // The raw text tells a realtor to use an API sandbox. That is our problem,
    // not theirs, and the replacement must not repeat it.
    expect(msg).not.toMatch(/sandbox/i);
    expect(msg).not.toMatch(/api\.pinterest\.com/);
  });

  it("says explicitly that reconnecting won't help", () => {
    // The neighbouring failure mode (missing boards:write) IS fixed by
    // reconnecting. Confusing the two costs the agent a pointless OAuth round
    // trip and leaves them believing their account is broken.
    expect(PINTEREST_TRIAL_ACCESS_MESSAGE).toMatch(/reconnect/i);
    expect(PINTEREST_TRIAL_ACCESS_MESSAGE).toMatch(/nothing is wrong/i);
  });

  it("still catches the trial block if Pinterest renumbers the code", () => {
    expect(agentFacingPinterestError(null, TRIAL_BODY)).toBe(PINTEREST_TRIAL_ACCESS_MESSAGE);
    expect(agentFacingPinterestError(999, TRIAL_BODY)).toBe(PINTEREST_TRIAL_ACCESS_MESSAGE);
  });

  it("leaves every other failure to speak for itself", () => {
    expect(agentFacingPinterestError(null, "Image could not be fetched")).toBeNull();
    expect(agentFacingPinterestError(3, "Your token does not have sufficient permissions")).toBeNull();
  });

  it("does not mistake the missing-scope error for the trial block", () => {
    // Both are 403s and the trial one hid behind this for a month; they must
    // not collapse into one message now that both are handled.
    const scopeBody =
      "Your token does not have sufficient permissions to perform this operation. " +
      "Please ensure your token is authorized with the correct set of scopes. " +
      "Missing: ['boards:write']";
    expect(agentFacingPinterestError(3, scopeBody)).toBeNull();
    expect(parseMissingScopes(scopeBody)).toEqual(["boards:write"]);
    expect(parseMissingScopes(TRIAL_BODY)).toEqual([]);
  });
});

describe("Pinterest API host override", () => {
  const orig = process.env.PINTEREST_API_BASE_URL;

  afterEach(() => {
    if (orig !== undefined) process.env.PINTEREST_API_BASE_URL = orig;
    else delete process.env.PINTEREST_API_BASE_URL;
    vi.resetModules();
  });

  async function loadGraph(override?: string) {
    if (override === undefined) delete process.env.PINTEREST_API_BASE_URL;
    else process.env.PINTEREST_API_BASE_URL = override;
    vi.resetModules();
    return import("@/lib/pinterest/graph");
  }

  it("defaults to production", async () => {
    const g = await loadGraph(undefined);
    expect(g.PINTEREST_API_BASE).toBe("https://api.pinterest.com/v5");
    expect(g.PINTEREST_OAUTH_TOKEN).toBe("https://api.pinterest.com/v5/oauth/token");
    expect(g.isPinterestSandbox()).toBe(false);
  });

  it("moves the REST base AND the token endpoint together", async () => {
    // Splitting them would mint a production token and spend it against the
    // sandbox, which fails in a way that looks like a credentials bug.
    const g = await loadGraph("https://api-sandbox.pinterest.com");
    expect(g.PINTEREST_API_BASE).toBe("https://api-sandbox.pinterest.com/v5");
    expect(g.PINTEREST_OAUTH_TOKEN).toBe("https://api-sandbox.pinterest.com/v5/oauth/token");
    expect(g.isPinterestSandbox()).toBe(true);
  });

  it("keeps the consent dialog on the real site", async () => {
    // The sandbox has no consent UI; a human always approves on pinterest.com.
    const g = await loadGraph("https://api-sandbox.pinterest.com");
    expect(g.PINTEREST_OAUTH_AUTHORIZE).toBe("https://www.pinterest.com/oauth/");
  });

  it("tolerates a trailing slash", async () => {
    const g = await loadGraph("https://api-sandbox.pinterest.com/");
    expect(g.PINTEREST_API_BASE).toBe("https://api-sandbox.pinterest.com/v5");
  });

  it("treats an empty value as unset", async () => {
    const g = await loadGraph("   ");
    expect(g.PINTEREST_API_BASE).toBe("https://api.pinterest.com/v5");
    expect(g.isPinterestSandbox()).toBe(false);
  });
});
