/**
 * The approval fingerprint, on both sides of the wire.
 *
 * The card (browser, `crypto.subtle`) and the server (`node:crypto`) must
 * produce the same 64 hex characters, and they must produce the SAME ones the
 * hand-written SHA-256 they replaced produced — proposals sitting in
 * `ai_approvals` were fingerprinted by the old code, and an owner approving
 * one tomorrow must not be told it changed.
 *
 * The vectors below were computed with that removed implementation (#1773's
 * `lib/ai-team/sha256.ts`) before it was deleted. Do not regenerate them: if
 * one fails, the serialization moved and every waiting proposal just broke.
 */
import { describe, expect, it, vi } from "vitest";
// `fingerprint.server` is server-only so the card cannot reach node:crypto.
vi.mock("server-only", () => ({}));
import { approvalFingerprintAsync, fingerprintInput } from "../fingerprint";
import { approvalFingerprint } from "../fingerprint.server";
import { pickDetails, type ApprovalDetails } from "../approval-view";
import { textProposal } from "./seed";

/** [action key, details, hex from the implementation this replaced]. */
const VECTORS: [string, ApprovalDetails, string][] = [
  [
    "text_client",
    { clientId: "aaaaaaaa-0000-4000-8000-000000000002", phone: "(415) 555-0143", message: "  Running 10 minutes late!\n" },
    "303e2b971ac6621c71a23fe465dc02a35f6be62f3410391354b6696aa4fa3ab1",
  ],
  [
    // Non-ASCII: the message is hashed as UTF-8, and a 4-byte emoji must not shift it.
    "send_invoice_reminder",
    {
      clientId: "aaaaaaaa-0000-4000-8000-000000000001",
      invoiceId: "bbbbbbbb-0000-4000-8000-000000001042",
      email: "dana@example.com",
      amount: 1200,
      currency: "USD",
      message: "Invoice INV-1042 是 overdue — 谢谢! 🎉",
    },
    "fbabac566855f6b1708cba4c750b3ac07eb7f9bf8be1b9d3916e26a3c724848b",
  ],
  // Nothing filled in at all: every field null, and still a real digest.
  ["reply_to_text", {}, "583911a9d9c828125cdfbcb28a9b1894b31fad92917e07c92dc9a8fbf4d5a15e"],
];

describe("the approval fingerprint", () => {
  it("still hashes what the hand-written SHA-256 hashed", async () => {
    for (const [actionKey, details, hex] of VECTORS) {
      expect(approvalFingerprint(actionKey, details), fingerprintInput(actionKey, details)).toBe(hex);
      await expect(approvalFingerprintAsync(actionKey, details)).resolves.toBe(hex);
    }
  });

  it("agrees between the browser's Web Crypto and the server's node:crypto", async () => {
    const shown = pickDetails(textProposal().details);
    for (const d of [shown, { ...shown, message: "Running 15 minutes late!" }, { ...shown, amount: 1200 }]) {
      await expect(approvalFingerprintAsync("text_client", d)).resolves.toBe(approvalFingerprint("text_client", d));
    }
  });

  const shown = pickDetails(textProposal().details);
  const fp = (d: Partial<ApprovalDetails>) => approvalFingerprint("text_client", { ...shown, ...d });

  it("is stable, and blind to whitespace around the message and to descriptive fields", () => {
    expect(fp({})).toMatch(/^[0-9a-f]{64}$/);
    expect(fp({ message: "  Running 10 minutes late!\n" })).toBe(fp({}));
    expect(fp({ clientName: "P. Shah", daysOverdue: 3 })).toBe(fp({}));
  });

  it("changes with the recipient, the destination, the amount, the invoice and the message", () => {
    const base = fp({});
    for (const change of [
      { clientId: "aaaaaaaa-0000-4000-8000-000000000001" },
      { phone: "(415) 555-0999" },
      { email: "priya@example.com" },
      { amount: 1200 },
      { currency: "EUR" },
      { invoiceId: "bbbbbbbb-0000-4000-8000-000000001042" },
      { message: "Running 15 minutes late!" },
    ]) {
      expect(fp(change), JSON.stringify(change)).not.toBe(base);
    }
    expect(approvalFingerprint("send_invoice_reminder", shown)).not.toBe(base);
  });

  /**
   * The specialists added after v1 hash fields v1 never had. The suffix is
   * emitted only when one of them is set — which is what keeps the vectors
   * above, and every proposal already waiting for an owner, exactly as they
   * were.
   */
  describe("the fields the later specialists decide on", () => {
    it("leaves an older action's bytes untouched", () => {
      expect(fingerprintInput("text_client", shown)).not.toMatch(/null,null,null,null,null,null\]$/);
      // Explicit nulls for every new field hash the same as not mentioning them.
      expect(
        fp({ callPurpose: null, network: null, scheduledFor: null, appointmentType: null, slotStart: null, note: null }),
      ).toBe(fp({}));
    });

    it("changes with the purpose of a call, the network and time of a post, and the slot of a booking", () => {
      const base = fp({});
      for (const change of [
        { note: "Ask how the repair went." },
        { callPurpose: "follow_up" },
        { network: "linkedin" },
        { scheduledFor: "2026-09-20T17:00:00.000Z" },
        { appointmentType: "Cleaning" },
        { slotStart: "2026-09-17T16:00:00.000Z" },
      ]) {
        expect(fp(change), JSON.stringify(change)).not.toBe(base);
      }
      // Two calls that differ only in purpose are two different calls.
      expect(fp({ callPurpose: "survey" })).not.toBe(fp({ callPurpose: "promo" }));
    });

    it("ignores the context a card shows but nobody receives", () => {
      const booking: ApprovalDetails = {
        clientId: "aaaaaaaa-0000-4000-8000-000000000002",
        appointmentType: "Cleaning",
        slotStart: "2026-09-17T16:00:00.000Z",
        message: "You're confirmed for Thursday, September 17 at 9 AM. See you then!",
      };
      const bare = approvalFingerprint("book_appointment", booking);
      expect(approvalFingerprint("book_appointment", { ...booking, slotLabel: "Thursday, September 17 at 9 AM" })).toBe(bare);
      expect(approvalFingerprint("book_appointment", { ...booking, reschedulesFrom: "Tuesday at 2 PM" })).toBe(bare);
      expect(approvalFingerprint("reply_to_text", { ...shown, incomingMessage: "are you open Saturday?" })).toBe(
        approvalFingerprint("reply_to_text", shown),
      );
    });
  });
});
