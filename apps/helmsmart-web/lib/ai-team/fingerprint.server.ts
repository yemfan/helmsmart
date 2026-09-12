/**
 * The server's side of the approval fingerprint — see `./fingerprint.ts` for
 * what is hashed and why. Synchronous, over the platform's own SHA-256.
 *
 * `server-only` is load-bearing: it keeps `node:crypto` out of any client
 * bundle, and `lib/client-server-imports.test.ts` enforces that mechanically.
 * A client component wanting a fingerprint awaits `approvalFingerprintAsync`.
 */
import "server-only";
import { createHash } from "node:crypto";
import type { ApprovalDetails } from "./approval-view";
import { fingerprintInput } from "./fingerprint";

export function approvalFingerprint(actionKey: string, d: ApprovalDetails): string {
  return createHash("sha256").update(fingerprintInput(actionKey, d), "utf8").digest("hex");
}
