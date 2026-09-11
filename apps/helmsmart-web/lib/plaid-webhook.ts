/**
 * Is this request really from Plaid?
 *
 * Plaid signs every webhook with an ES256 JWT in the `Plaid-Verification`
 * header. The JWT carries a SHA-256 of the exact body bytes and an `iat`; its
 * `kid` names a public key we fetch from `/webhook_verification_key/get` with
 * our own credentials. A request passes only if all of these hold:
 *
 *   1. the JWT header says `alg: "ES256"` — anything else, `none` included, is
 *      refused before a key is even looked up;
 *   2. Plaid knows the `kid`, and has not expired that key (`expired_at` null);
 *   3. the signature verifies against that key;
 *   4. `iat` is within five minutes of now, so a captured webhook cannot be
 *      replayed later;
 *   5. `request_body_sha256` equals the SHA-256 of the body we received, so a
 *      genuine signature cannot be carried onto a different body.
 *
 * Built on `node:crypto` rather than a JWT library: one algorithm, one key
 * shape, and nothing to add to the lockfile. The key cache follows Plaid's
 * reference implementation:
 * https://plaid.com/docs/api/webhooks/webhook-verification/
 */
import { createHash, createPublicKey, timingSafeEqual, verify } from "node:crypto";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import type { JWKPublicKey } from "plaid";

const plaidClient = new PlaidApi(
  new Configuration({
    basePath: PlaidEnvironments[process.env.PLAID_ENV as keyof typeof PlaidEnvironments ?? "sandbox"],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID!,
        "PLAID-SECRET": process.env.PLAID_SECRET!,
      },
    },
  })
);

/** How far `iat` may be from now, in seconds. Plaid's recommendation. */
const MAX_AGE_SECONDS = 5 * 60;

/** Verification keys by `kid`, for as long as this instance stays warm. */
const keyCache = new Map<string, JWKPublicKey>();

async function fetchKey(kid: string): Promise<void> {
  try {
    const res = await plaidClient.webhookVerificationKeyGet({ key_id: kid });
    keyCache.set(kid, res.data.key);
  } catch (err) {
    const code = (err as { response?: { data?: { error_code?: string } } })?.response?.data?.error_code;
    console.warn(`[plaid/webhook] no verification key for kid ${kid}:`, code ?? err);
  }
}

async function keyFor(kid: string): Promise<JWKPublicKey | null> {
  if (!keyCache.has(kid)) {
    // An unseen kid is what a rotation looks like. Re-fetch every cached key
    // not yet marked expired as well, so a rotated-out key stops being accepted.
    const stillLive = [...keyCache].filter(([, k]) => k.expired_at == null).map(([id]) => id);
    await Promise.all([...stillLive, kid].map(fetchKey));
  }
  return keyCache.get(kid) ?? null;
}

function decodeSegment(segment: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function reject(reason: string): false {
  console.warn(`[plaid/webhook] rejected: ${reason}`);
  return false;
}

/**
 * True only for a request Plaid signed, about exactly this `body`, in the last
 * five minutes. `jwt` is the `Plaid-Verification` header as received.
 */
export async function verifyPlaidWebhook(body: string, jwt: string | null, now = Date.now()): Promise<boolean> {
  if (!jwt) return reject("no Plaid-Verification header");
  const parts = jwt.split(".");
  if (parts.length !== 3) return reject("not a JWT");
  const [headerSeg, payloadSeg, signatureSeg] = parts;

  const header = decodeSegment(headerSeg);
  if (header?.alg !== "ES256") return reject(`alg ${String(header?.alg)}`);
  if (typeof header.kid !== "string") return reject("no kid");

  const key = await keyFor(header.kid);
  if (!key) return reject(`unknown kid ${header.kid}`);
  if (key.expired_at != null) return reject(`expired kid ${header.kid}`);

  let signed = false;
  try {
    signed = verify(
      "sha256",
      Buffer.from(`${headerSeg}.${payloadSeg}`),
      {
        key: createPublicKey({ key: { kty: key.kty, crv: key.crv, x: key.x, y: key.y }, format: "jwk" }),
        dsaEncoding: "ieee-p1363",
      },
      Buffer.from(signatureSeg, "base64url")
    );
  } catch {
    signed = false;
  }
  if (!signed) return reject("bad signature");

  const claims = decodeSegment(payloadSeg);
  const iat = claims?.iat;
  if (typeof iat !== "number" || Math.abs(now / 1000 - iat) > MAX_AGE_SECONDS) return reject(`iat ${String(iat)}`);

  const claimed = claims?.request_body_sha256;
  const actual = createHash("sha256").update(body, "utf8").digest("hex");
  if (typeof claimed !== "string" || claimed.length !== actual.length || !timingSafeEqual(Buffer.from(claimed), Buffer.from(actual))) {
    return reject("body hash mismatch");
  }
  return true;
}
