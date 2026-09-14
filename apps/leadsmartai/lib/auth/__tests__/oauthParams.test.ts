import { describe, expect, it } from "vitest";
import { oauthQueryParams } from "../oauthParams";

describe("oauthQueryParams", () => {
  it("asks Google for the account chooser, so a second account can sign in", () => {
    expect(oauthQueryParams("google")).toEqual({ prompt: "select_account" });
  });

  it("sends nothing extra to Apple, which has no such parameter", () => {
    expect(oauthQueryParams("apple")).toBeUndefined();
  });
});
