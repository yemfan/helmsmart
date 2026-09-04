import { describe, expect, it } from "vitest";

import { mobileAppVersion, versionAtLeast } from "../appVersion";

function reqWith(version?: string): Request {
  const headers = new Headers();
  if (version !== undefined) headers.set("X-App-Version", version);
  return new Request("https://example.test/api/mobile/inbox", { headers });
}

describe("mobileAppVersion", () => {
  it("reads a dotted version off the header", () => {
    expect(mobileAppVersion(reqWith("1.7.0"))).toBe("1.7.0");
    expect(mobileAppVersion(reqWith(" 2.0 "))).toBe("2.0");
  });

  it("treats a missing or malformed header as unknown", () => {
    expect(mobileAppVersion(reqWith())).toBeNull();
    expect(mobileAppVersion(reqWith(""))).toBeNull();
    expect(mobileAppVersion(reqWith("latest"))).toBeNull();
    expect(mobileAppVersion(reqWith("1.7.0-beta"))).toBeNull();
  });
});

describe("versionAtLeast", () => {
  it("compares numerically, not lexically", () => {
    expect(versionAtLeast("1.10.0", "1.7.0")).toBe(true);
    expect(versionAtLeast("1.7.0", "1.10.0")).toBe(false);
  });

  it("is inclusive at the minimum and pads missing parts with zero", () => {
    expect(versionAtLeast("1.7.0", "1.7.0")).toBe(true);
    expect(versionAtLeast("1.7", "1.7.0")).toBe(true);
    expect(versionAtLeast("1.6.9", "1.7.0")).toBe(false);
    expect(versionAtLeast("2", "1.7.0")).toBe(true);
  });

  it("never lets an unknown build through", () => {
    expect(versionAtLeast(null, "1.7.0")).toBe(false);
  });
});
