import { describe, expect, it } from "vitest";

import { defaultGreeting, isStockGreeting } from "@/lib/receptionist-greeting";

/**
 * Caught by walking the guided setup for real: step 2 promises "here's what
 * Emma will say" and showed "Hello! Thank you for calling. How can I help you
 * today?" — the column default, naming no business. The draft had declined to
 * overwrite it because it was not empty. A value the product put there is not
 * a value the owner chose, and this is the line between them.
 */
describe("isStockGreeting", () => {
  it("counts the shipped defaults as nothing chosen", () => {
    // The one `organizations.voice_agent_greeting` defaults to, and the one
    // the Settings form falls back to.
    expect(isStockGreeting("Hello! Thank you for calling. How can I help you today?")).toBe(true);
    expect(isStockGreeting("  Hello! Thank you for calling. How can I help you today?  ")).toBe(true);
    expect(isStockGreeting("")).toBe(true);
    expect(isStockGreeting(null)).toBe(true);
    expect(isStockGreeting(undefined)).toBe(true);
  });

  it("never touches a greeting someone actually wrote", () => {
    expect(isStockGreeting("Thanks for calling Acme Plumbing! This is Emma.")).toBe(false);
    // A near miss is still the owner's sentence — matched exactly, on purpose.
    expect(isStockGreeting("Hello! Thank you for calling Acme. How can I help you today?")).toBe(false);
  });
});

describe("defaultGreeting", () => {
  it("names the business, which is the entire point", () => {
    expect(defaultGreeting("Acme Plumbing")).toContain("Acme Plumbing");
    expect(isStockGreeting(defaultGreeting("Acme Plumbing"))).toBe(false);
  });

  it("still says something sensible with no name to use", () => {
    expect(defaultGreeting("   ")).toContain("our office");
  });
});
