import { describe, expect, it } from "vitest";

import {
  buildOutboundDemoTwimlUrl,
  normalizeTargetPhone,
  validateOutboundCallEnv,
  type OutboundCallEnv,
} from "@/lib/voice-ai-demo/preflight";

function isFailure<T extends { ok: boolean }>(
  r: T,
): r is Extract<T, { ok: false }> {
  return r.ok === false;
}

const FULL_ENV: OutboundCallEnv = {
  TWILIO_ACCOUNT_SID: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  TWILIO_AUTH_TOKEN: "deadbeefdeadbeefdeadbeefdeadbeef",
  TWILIO_PHONE_NUMBER: "+14155550100",
  APP_BASE_URL: "https://app.realtybossai.com",
};

describe("validateOutboundCallEnv", () => {
  it("succeeds with all four values", () => {
    const out = validateOutboundCallEnv(FULL_ENV);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.env.appBaseUrl).toBe("https://app.realtybossai.com");
    }
  });

  it("rejects when TWILIO_ACCOUNT_SID is missing or blank", () => {
    for (const sid of [undefined, "", "   "]) {
      const out = validateOutboundCallEnv({ ...FULL_ENV, TWILIO_ACCOUNT_SID: sid });
      expect(out.ok).toBe(false);
      if (isFailure(out)) expect(out.code).toBe("twilio_account_sid_missing");
    }
  });

  it("rejects when TWILIO_AUTH_TOKEN is missing", () => {
    const out = validateOutboundCallEnv({ ...FULL_ENV, TWILIO_AUTH_TOKEN: "" });
    expect(out.ok).toBe(false);
    if (isFailure(out)) expect(out.code).toBe("twilio_auth_token_missing");
  });

  it("accepts TWILIO_FROM_NUMBER as a fallback for TWILIO_PHONE_NUMBER", () => {
    const out = validateOutboundCallEnv({
      ...FULL_ENV,
      TWILIO_PHONE_NUMBER: undefined,
      TWILIO_FROM_NUMBER: "+14155550100",
    });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.env.fromNumber).toBe("+14155550100");
  });

  it("prefers TWILIO_PHONE_NUMBER when both are set", () => {
    const out = validateOutboundCallEnv({
      ...FULL_ENV,
      TWILIO_PHONE_NUMBER: "+14155550100",
      TWILIO_FROM_NUMBER: "+12125551234",
    });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.env.fromNumber).toBe("+14155550100");
  });

  it("rejects when no from-number is set in either env var", () => {
    const out = validateOutboundCallEnv({
      ...FULL_ENV,
      TWILIO_PHONE_NUMBER: undefined,
      TWILIO_FROM_NUMBER: undefined,
    });
    expect(out.ok).toBe(false);
    if (isFailure(out)) expect(out.code).toBe("twilio_from_missing");
  });

  it("rejects when APP_BASE_URL is missing", () => {
    const out = validateOutboundCallEnv({ ...FULL_ENV, APP_BASE_URL: undefined });
    expect(out.ok).toBe(false);
    if (isFailure(out)) expect(out.code).toBe("app_base_url_missing");
  });

  it("strips trailing slash from APP_BASE_URL", () => {
    const out = validateOutboundCallEnv({
      ...FULL_ENV,
      APP_BASE_URL: "https://app.realtybossai.com/",
    });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.env.appBaseUrl).toBe("https://app.realtybossai.com");
  });
});

describe("normalizeTargetPhone", () => {
  it("returns null for empty / null / non-string input", () => {
    expect(normalizeTargetPhone(null)).toBeNull();
    expect(normalizeTargetPhone(undefined)).toBeNull();
    expect(normalizeTargetPhone("")).toBeNull();
  });

  it("emits E.164 from a bare 10-digit number", () => {
    expect(normalizeTargetPhone("4155550123")).toBe("+14155550123");
  });

  it("emits E.164 from a formatted 10-digit number", () => {
    expect(normalizeTargetPhone("(415) 555-0123")).toBe("+14155550123");
    expect(normalizeTargetPhone("415.555.0123")).toBe("+14155550123");
  });

  it("strips a leading 1 country code (with or without plus)", () => {
    expect(normalizeTargetPhone("14155550123")).toBe("+14155550123");
    expect(normalizeTargetPhone("+14155550123")).toBe("+14155550123");
    expect(normalizeTargetPhone("+1 (415) 555-0123")).toBe("+14155550123");
  });

  it("rejects too-short numbers", () => {
    expect(normalizeTargetPhone("4155550")).toBeNull();
  });

  it("rejects too-long numbers (12+ digits, not just a 1-prefix)", () => {
    expect(normalizeTargetPhone("123456789012")).toBeNull();
  });
});

describe("buildOutboundDemoTwimlUrl", () => {
  it("appends the route path to the base URL", () => {
    expect(buildOutboundDemoTwimlUrl("https://app.realtybossai.com")).toBe(
      "https://app.realtybossai.com/api/twilio/voice/outbound-demo",
    );
  });

  it("does not double-slash when the base URL has a trailing /", () => {
    expect(buildOutboundDemoTwimlUrl("https://app.realtybossai.com/")).toBe(
      "https://app.realtybossai.com/api/twilio/voice/outbound-demo",
    );
  });
});
