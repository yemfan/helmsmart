import { NextResponse } from "next/server";
import crypto from "node:crypto";

export const runtime = "nodejs";

/**
 * Meta data-deletion callback.
 *
 * Endpoint contract (Meta-defined):
 *   POST /api/meta/data-deletion
 *   Content-Type: application/x-www-form-urlencoded
 *   Body: signed_request=<base64url-signed-request>
 *
 * The signed request is `<base64url-signature>.<base64url-payload>`
 * where the signature is HMAC-SHA256(META_APP_SECRET, payload)
 * and the payload JSON contains { user_id, issued_at, algorithm }.
 *
 * Response (200, JSON):
 *   { "url": "<status URL>", "confirmation_code": "<unique code>" }
 *
 * Meta passes the `url` back to the user so they can check the
 * deletion status. The page at /data-deletion-status/[code]
 * renders a pending/completed indicator.
 *
 * **Status: stub.** Phase 1C ships the URL-callback shape Meta
 * expects so App Review can pass. The actual Meta-linked-data
 * teardown (OAuth tokens, page IDs, lead-ad campaign metadata)
 * lands with Phase 2 — there's nothing to delete yet because
 * Phase 2 hasn't introduced any of those rows. This stub still
 * logs the request so we have an audit trail when real data
 * starts flowing.
 *
 * See apps/leadsmartai/docs/meta-app-review.md for the broader
 * App Review submission package this endpoint is part of.
 */

const META_APP_SECRET = process.env.META_APP_SECRET ?? "";

type Payload = {
  user_id?: string;
  issued_at?: number;
  algorithm?: string;
};

/**
 * Base64url decode — Meta uses URL-safe base64 (no padding, `-_`
 * instead of `+/`). Node's Buffer can read it with `base64url`.
 */
function decodeBase64Url(input: string): Buffer {
  return Buffer.from(input, "base64url");
}

/**
 * Parse + validate Meta's signed_request param. Returns the
 * payload on success, throws on any verification failure
 * (caller maps to a 400).
 */
function parseSignedRequest(signedRequest: string): Payload {
  const dot = signedRequest.indexOf(".");
  if (dot <= 0) {
    throw new Error("Malformed signed_request — expected sig.payload");
  }
  const sigEncoded = signedRequest.slice(0, dot);
  const payloadEncoded = signedRequest.slice(dot + 1);

  const expectedSig = crypto
    .createHmac("sha256", META_APP_SECRET)
    .update(payloadEncoded)
    .digest();
  const providedSig = decodeBase64Url(sigEncoded);

  // Constant-time compare; lengths must match before timingSafeEqual.
  if (providedSig.length !== expectedSig.length) {
    throw new Error("Signature length mismatch");
  }
  if (!crypto.timingSafeEqual(providedSig, expectedSig)) {
    throw new Error("Signature mismatch");
  }

  const payloadBuf = decodeBase64Url(payloadEncoded);
  let payload: Payload;
  try {
    payload = JSON.parse(payloadBuf.toString("utf-8"));
  } catch {
    throw new Error("Payload JSON parse failed");
  }

  if (payload.algorithm && payload.algorithm !== "HMAC-SHA256") {
    throw new Error(`Unexpected algorithm: ${payload.algorithm}`);
  }
  if (!payload.user_id) {
    throw new Error("Payload missing user_id");
  }
  return payload;
}

/**
 * Best-effort base for status URLs. APP_BASE_URL is set in prod;
 * falls back to a hard-coded production URL so Meta's review
 * sandbox never receives a localhost or empty URL.
 */
function statusBaseUrl(): string {
  const base = (process.env.APP_BASE_URL || "").replace(/\/$/, "");
  if (base) return base;
  return "https://www.realtybossai.com";
}

export async function POST(req: Request) {
  if (!META_APP_SECRET) {
    // No app secret configured — refuse the request rather than
    // accepting unsigned deletions. App Review will fail this
    // explicitly if META_APP_SECRET isn't set in prod env vars.
    console.error("[meta/data-deletion] META_APP_SECRET is not set");
    return NextResponse.json(
      { error: "Service not configured" },
      { status: 503 },
    );
  }

  try {
    let signedRequest = "";
    const contentType = (req.headers.get("content-type") ?? "").toLowerCase();
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const form = await req.formData();
      signedRequest = String(form.get("signed_request") ?? "").trim();
    } else if (contentType.includes("application/json")) {
      // Meta documents form-urlencoded, but accepting JSON too keeps
      // the endpoint usable in case Meta or a manual test client
      // sends it differently. Cheap to support.
      const body = (await req.json().catch(() => ({}))) as { signed_request?: string };
      signedRequest = (body.signed_request ?? "").trim();
    }

    if (!signedRequest) {
      return NextResponse.json(
        { error: "Missing signed_request" },
        { status: 400 },
      );
    }

    const payload = parseSignedRequest(signedRequest);

    // Generate a confirmation code the user can quote when
    // contacting support, and that the status page resolves to a
    // human-readable progress indicator.
    //
    // Format: <14 random hex chars>-<last 4 chars of FB user_id>
    // Keeps codes short enough for a URL while being globally
    // unique within our request volume.
    const fbUserSuffix = (payload.user_id ?? "").slice(-4) || "user";
    const random = crypto.randomBytes(7).toString("hex");
    const confirmationCode = `${random}-${fbUserSuffix}`;

    // Phase 1C audit: console-log so we have a paper trail in
    // Vercel runtime logs. Phase 2 swaps this for a row in a
    // `meta_deletion_requests` audit table that the status page
    // reads from to render real progress.
    console.info("[meta/data-deletion] request received", {
      fbUserId: payload.user_id,
      issuedAt: payload.issued_at,
      confirmationCode,
      timestamp: new Date().toISOString(),
    });

    const url = `${statusBaseUrl()}/data-deletion-status/${encodeURIComponent(
      confirmationCode,
    )}`;

    return NextResponse.json({
      url,
      confirmation_code: confirmationCode,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Bad request";
    // Most failures here are signature mismatches — log + 400.
    // Don't leak the specific failure to the caller; Meta only
    // needs to know the request wasn't accepted.
    console.warn("[meta/data-deletion] rejected:", msg);
    return NextResponse.json(
      { error: "Invalid signed_request" },
      { status: 400 },
    );
  }
}
