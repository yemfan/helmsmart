import { randomBytes } from "crypto";

// base58 (Bitcoin alphabet) — no 0/O/I/l ambiguity, URL-safe, print-safe.
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** 8-char base58 slug. Immutable once assigned on first publish (handoff §5). */
export function generateSlug(length = 8): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}
