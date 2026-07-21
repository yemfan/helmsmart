/**
 * Tests for sender resolution.
 *
 * The bug these guard against: RESEND_FROM_EMAIL is *set but empty* in the
 * helmsmart Vercel project, and the old call sites used
 * `process.env.RESEND_FROM_EMAIL ?? "noreply@smbai.app"`. `??` only falls back
 * on null/undefined, so an empty string sailed through as the sender and every
 * send was rejected. Resolution happens at module load, so each case re-imports
 * the module with a fresh env.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// lib/email.ts is server-only; the marker module throws outside an RSC bundle.
vi.mock("server-only", () => ({}));
vi.mock("resend", () => ({ Resend: class {} }));

const ORIGINAL_ENV = process.env;

async function loadEmailModule(env: Record<string, string | undefined>) {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV, ...env };
  return import("./email");
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe("FROM_ADDRESS", () => {
  it("falls back to the verified domain when RESEND_FROM_EMAIL is an empty string", async () => {
    const { FROM_ADDRESS } = await loadEmailModule({ RESEND_FROM_EMAIL: "" });
    expect(FROM_ADDRESS).toBe("noreply@closebossai.com");
  });

  it("falls back when RESEND_FROM_EMAIL is unset", async () => {
    const { FROM_ADDRESS } = await loadEmailModule({ RESEND_FROM_EMAIL: undefined });
    expect(FROM_ADDRESS).toBe("noreply@closebossai.com");
  });

  it("falls back when RESEND_FROM_EMAIL is only whitespace", async () => {
    const { FROM_ADDRESS } = await loadEmailModule({ RESEND_FROM_EMAIL: "   " });
    expect(FROM_ADDRESS).toBe("noreply@closebossai.com");
  });

  it("honors a bare RESEND_FROM_EMAIL override", async () => {
    const { FROM_ADDRESS } = await loadEmailModule({
      RESEND_FROM_EMAIL: "hello@helmsmart.ai",
    });
    expect(FROM_ADDRESS).toBe("hello@helmsmart.ai");
  });

  it("extracts the bare address from a 'Name <addr>' override", async () => {
    const { FROM_ADDRESS } = await loadEmailModule({
      RESEND_FROM_EMAIL: "HelmSmart <hello@helmsmart.ai>",
    });
    expect(FROM_ADDRESS).toBe("hello@helmsmart.ai");
  });
});

describe("senderFrom", () => {
  it("composes a caller's display name onto the verified address", async () => {
    const { senderFrom } = await loadEmailModule({ RESEND_FROM_EMAIL: "" });
    expect(senderFrom("Acme Plumbing")).toBe(
      "Acme Plumbing <noreply@closebossai.com>"
    );
  });

  it("uses the brand name when no display name is given", async () => {
    const { senderFrom } = await loadEmailModule({
      RESEND_FROM_EMAIL: "",
      EMAIL_FROM_NAME: undefined,
    });
    expect(senderFrom()).toBe("HelmSmart <noreply@closebossai.com>");
  });

  it("never emits a display name onto an unverified domain", async () => {
    // Even when a caller brands the email, the address stays on the
    // verified domain — this is what the old per-org senders got wrong.
    const { senderFrom } = await loadEmailModule({ RESEND_FROM_EMAIL: "" });
    expect(senderFrom("Acme")).toContain("@closebossai.com");
    expect(senderFrom("Acme")).not.toContain("helmsmart.app");
  });
});
