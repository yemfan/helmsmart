import { describe, expect, it, vi } from "vitest";

// Both modules are server-only and reach for the service-role client at import
// time; none of that is needed to exercise the scope logic.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: {} }));

const { PINTEREST_OAUTH_SCOPES, missingPinterestScopes } = await import(
  "../pinterest-oauth"
);
const { parseMissingScopes } = await import("../pinterest-post");

describe("PINTEREST_OAUTH_SCOPES", () => {
  it("requests boards:write — POST /v5/pins writes into a board", () => {
    // Without it every Pin came back 403 "Missing: ['boards:write']", which is
    // how 21 scheduled Pins failed while the connection looked healthy.
    expect(PINTEREST_OAUTH_SCOPES).toContain("boards:write");
    expect(PINTEREST_OAUTH_SCOPES).toContain("pins:write");
  });
});

describe("missingPinterestScopes", () => {
  it("names what a pre-fix token is missing", () => {
    // The scopes the live connection was minted with.
    const granted = ["user_accounts:read", "boards:read", "pins:read", "pins:write"];
    expect(missingPinterestScopes(granted)).toEqual(["boards:write"]);
  });

  it("is silent when the grant is complete", () => {
    expect(missingPinterestScopes([...PINTEREST_OAUTH_SCOPES])).toEqual([]);
  });

  it("assumes fine when Pinterest didn't report a scope list", () => {
    // No list is not evidence of a missing scope — don't block a good connect.
    expect(missingPinterestScopes(null)).toEqual([]);
    expect(missingPinterestScopes([])).toEqual([]);
  });
});

describe("parseMissingScopes", () => {
  it("extracts the scope names from the real 403 body", () => {
    const msg =
      "Pinterest publish failed: Your token does not have sufficient permissions " +
      "to perform this operation. Please ensure your token is authorized with the " +
      "correct set of scopes. Missing: ['boards:write']";
    expect(parseMissingScopes(msg)).toEqual(["boards:write"]);
  });

  it("handles several missing scopes and double quotes", () => {
    expect(parseMissingScopes('Missing: ["boards:write", "pins:write"]')).toEqual([
      "boards:write",
      "pins:write",
    ]);
  });

  it("returns nothing for errors that aren't about scopes", () => {
    expect(parseMissingScopes("Pinterest publish failed: HTTP 500")).toEqual([]);
    expect(parseMissingScopes("Missing: []")).toEqual([]);
  });
});
