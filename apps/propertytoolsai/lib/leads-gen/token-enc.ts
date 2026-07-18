import "server-only";
import crypto from "node:crypto";

/**
 * AES-256-GCM token encryption for `social_accounts` columns.
 *
 * Ported from apps/leadsmartai — PropertyTools AI shares the same Supabase
 * project (babmbowmzwizoahkmshx), so `SOCIAL_TOKEN_ENC_KEY` here MUST be the
 * identical value used by leadsmartai, or tokens written by one app can't be
 * decrypted by the other.
 *
 * Key provisioning:
 *
 *   openssl rand -base64 32
 *   vercel env add SOCIAL_TOKEN_ENC_KEY production
 *
 * Format: "<iv-b64>.<authTag-b64>.<ciphertext-b64>"
 *   - iv is 12 bytes (recommended for GCM)
 *   - authTag is 16 bytes
 *
 * Authenticated encryption — `decryptToken` throws on any tampering.
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
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
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
