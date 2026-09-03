import { describe, it, expect } from "vitest";
import { inboundAddressFor } from "./inboundAddress";

describe("inboundAddressFor", () => {
  it("builds the address from a slug and a bare domain", () => {
    expect(inboundAddressFor("acme-123", "inbox.helmsmart.ai")).toBe(
      "acme-123@inbox.helmsmart.ai",
    );
  });

  // The production bug: INBOUND_EMAIL_DOMAIN was "inbox@helmsmart.ai", which
  // rendered "ken-1788408836607@inbox@helmsmart.ai" on the settings page and
  // made the inbound webhook drop every message.
  it("returns null when the domain itself contains an @", () => {
    expect(inboundAddressFor("ken-1788408836607", "inbox@helmsmart.ai")).toBeNull();
  });

  it("returns null when inbound email is not configured", () => {
    expect(inboundAddressFor("acme", "")).toBeNull();
    expect(inboundAddressFor("acme", undefined)).toBeNull();
    expect(inboundAddressFor("acme", null)).toBeNull();
  });

  it("returns null without a slug", () => {
    expect(inboundAddressFor("", "inbox.helmsmart.ai")).toBeNull();
    expect(inboundAddressFor(null, "inbox.helmsmart.ai")).toBeNull();
    expect(inboundAddressFor(undefined, "inbox.helmsmart.ai")).toBeNull();
  });

  it("rejects a domain that is not a bare hostname", () => {
    expect(inboundAddressFor("acme", "https://inbox.helmsmart.ai")).toBeNull();
    expect(inboundAddressFor("acme", "inbox.helmsmart.ai/mail")).toBeNull();
    expect(inboundAddressFor("acme", "localhost")).toBeNull(); // no dot
    expect(inboundAddressFor("acme", "inbox .helmsmart.ai")).toBeNull();
    expect(inboundAddressFor("acme", "-bad.helmsmart.ai")).toBeNull();
  });

  it("rejects a slug that could not be a local part", () => {
    expect(inboundAddressFor("has space", "inbox.helmsmart.ai")).toBeNull();
    expect(inboundAddressFor("has@at", "inbox.helmsmart.ai")).toBeNull();
    expect(inboundAddressFor("-leading", "inbox.helmsmart.ai")).toBeNull();
  });

  it("normalises case and surrounding whitespace", () => {
    expect(inboundAddressFor("  Acme  ", "  Inbox.HelmSmart.ai ")).toBe(
      "acme@inbox.helmsmart.ai",
    );
  });
});
