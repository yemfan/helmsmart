import "server-only";
import crypto from "node:crypto";

/**
 * AES-256-GCM token encryption for `social_accounts` columns.
 *
 * Why app-level instead of Postgres pgcrypto: the key never lives
 * in the database. Compromising the DB doesn't compromise the
 * tokens — an attacker who reads the encrypted columns still
 * needs `SOCIAL_TOKEN_ENC_KEY` to decrypt.
 *
 * Key provisioning:
 *
 *   openssl rand -base64 32
 *   vercel env add SOCIAL_TOKEN_ENC_KEY production
 *
 * Rotation: bump the env var, re-encrypt all rows with the new
 * key in a one-off script. Simpler than maintaining a key ring
 * since we expect rotations to be rare and operational.
 *
 * Format: "<iv-b64>.<authTag-b64>.<ciphertext-b64>"
 *
 *   - iv is 12 bytes (recommended for GCM)
 *   - authTag is 16 bytes
 *   - ciphertext is whatever the plaintext encrypts to
 *
 * Authenticated encryption — `decryptToken` throws on any
 * tampering (key mismatch, truncation, bit flip). Callers
 * should catch + mark the row status='error' so the agent
 * sees "Reconnect Facebook" instead of a confusing 500.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getKey(): Buffer {
  const raw = process.env.SOCIAL_TOKEN_ENC_KEY?.trim();
  if (!raw) {
    throw new Error(
      "SOCIAL_TOKEN_ENC_KEY is not configured. Generate with `openssl rand -base64 32` and set in Vercel env.",
    );
  }
  // The key is stored base64-encoded. Decoded must be exactly 32 bytes
  // for AES-256. Loud error if not, so a misconfigured env var fails
  // at first call instead of producing silently-wrong ciphertext.
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length !== 32) {
    throw new Error(
      `SOCIAL_TOKEN_ENC_KEY must decode to 32 bytes; got ${decoded.length}.`,
    );
  }
  return decoded;
}

export function encryptToken(plaintext: string): string {
  if (!plaintext) {
    throw new Error("encryptToken: empty plaintext");
  }
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const enc = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

export function decryptToken(payload: string): string {
  if (!payload) {
    throw new Error("decryptToken: empty payload");
  }
  const parts = payload.split(".");
  if (parts.length !== 3) {
    throw new Error("decryptToken: malformed payload (expected 3 base64 parts)");
  }
  const [ivB64, tagB64, encB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const enc = Buffer.from(encB64, "base64");
  if (iv.length !== IV_LENGTH) {
    throw new Error(`decryptToken: wrong IV length (${iv.length})`);
  }
  if (tag.length !== 16) {
    throw new Error(`decryptToken: wrong auth-tag length (${tag.length})`);
  }
  const key = getKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(enc), decipher.final()]);
  return decrypted.toString("utf8");
}

/**
 * Convenience: encrypt a token, or return null for a null input.
 * Lets callers pass through optional fields without conditional
 * encryption blocks at each call site.
 */
export function encryptTokenOptional(plaintext: string | null | undefined): string | null {
  if (!plaintext) return null;
  return encryptToken(plaintext);
}

/**
 * Transition-safe decrypt: returns the decrypted token, or the raw value
 * unchanged if it isn't a valid ciphertext (legacy plaintext rows written
 * before a column was encrypted).
 *
 * `decryptToken` throws on anything that isn't well-formed AES-256-GCM
 * ciphertext (wrong part count, wrong IV/tag length, failed auth), so a
 * plaintext token — even one that happens to contain dots, like a Google
 * `ya29.…` access token — reliably falls through to the raw branch. Once the
 * row is rewritten (e.g. on the next token refresh) it becomes ciphertext and
 * decrypts normally. Use only for reads of columns mid-migration to encrypted
 * storage; new writes must always call `encryptToken`.
 */
export function decryptTokenLenient(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return decryptToken(value);
  } catch {
    return value;
  }
}
