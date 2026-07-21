/**
 * Tencent WeChat Official Account webhook.
 *
 * Configured in the Tencent admin console as the target URL for the
 * JV-owned Service Account:
 *
 *   https://www.closebossai.com/api/wechat/callback
 *
 * Two verbs:
 *
 *   GET  — one-time verification handshake. Tencent pings this URL
 *          when you save webhook settings in the admin console; we
 *          have to echo back the `echostr` query param iff the
 *          signature matches.
 *
 *   POST — every subsequent inbound event: user-sent text, user
 *          scan of an agent's QR, user unsubscribe, etc. We parse,
 *          log to `wechat_messages`, upsert `wechat_user_links`, and
 *          respond with an empty body (Tencent accepts that as
 *          "no passive reply"). Any processing that takes > 5s
 *          should happen via a queued job — Tencent's timeout is
 *          brutal and triggers retries.
 *
 * All traffic is gated by:
 *   * WECHAT_ENABLED env var (must equal "1" — otherwise 503)
 *   * A valid wechat_oa_accounts row matching WECHAT_APP_ID env
 *
 * This means the route is safely dormant from merge until the JV
 * Service Account is registered AND an operator flips WECHAT_ENABLED=1
 * in Vercel + seeds the `wechat_oa_accounts` row. No accidental
 * production traffic during the JV-registration waiting period.
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyTencentSignature } from "@/lib/wechat/verifySignature";
import { parseTencentXml } from "@/lib/wechat/xml";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Tencent expects plain text for the handshake and XML (or empty) for
// subsequent replies. Keep Content-Type explicit so Vercel's edge
// doesn't helpfully set it wrong.
const TEXT_HEADERS = { "Content-Type": "text/plain; charset=utf-8" };
const XML_HEADERS = { "Content-Type": "application/xml; charset=utf-8" };

function isEnabled(): boolean {
  return process.env.WECHAT_ENABLED?.trim() === "1";
}

type OaRow = {
  id: string;
  app_id: string;
  verification_token: string;
};

async function loadActiveOa(): Promise<OaRow | null> {
  const appId = process.env.WECHAT_APP_ID?.trim();
  if (!appId) return null;
  const { data, error } = await supabaseAdmin
    .from("wechat_oa_accounts")
    .select("id, app_id, verification_token")
    .eq("app_id", appId)
    .maybeSingle();
  if (error || !data) return null;
  return data as OaRow;
}

/**
 * GET — Tencent verification handshake. Used once when the webhook URL
 * is saved in the admin console, and occasionally when Tencent wants
 * to re-verify (e.g. after we toggle message encryption mode).
 *
 * Response must be the raw `echostr` value (no JSON, no wrapping) when
 * the signature checks out. Anything else and Tencent flags the
 * webhook as misconfigured in the admin UI.
 */
export async function GET(req: Request) {
  if (!isEnabled()) {
    return new NextResponse("WeChat integration disabled.", {
      status: 503,
      headers: TEXT_HEADERS,
    });
  }

  const oa = await loadActiveOa();
  if (!oa) {
    return new NextResponse("WeChat OA not configured.", {
      status: 503,
      headers: TEXT_HEADERS,
    });
  }

  const url = new URL(req.url);
  const signature = url.searchParams.get("signature") ?? "";
  const timestamp = url.searchParams.get("timestamp") ?? "";
  const nonce = url.searchParams.get("nonce") ?? "";
  const echostr = url.searchParams.get("echostr") ?? "";

  if (
    !verifyTencentSignature({
      token: oa.verification_token,
      timestamp,
      nonce,
      signature,
    })
  ) {
    return new NextResponse("Signature mismatch.", {
      status: 401,
      headers: TEXT_HEADERS,
    });
  }

  return new NextResponse(echostr, { status: 200, headers: TEXT_HEADERS });
}

/**
 * POST — inbound message or event from a subscriber. Must respond
 * within ~5 seconds. Anything slower needs to move to a background
 * job — Tencent retries on timeout and can disable the webhook after
 * enough failures.
 *
 * Current behavior:
 *   1. Verify signature (same key-sort SHA1 as GET).
 *   2. Parse the XML body.
 *   3. Upsert the subscriber into `wechat_user_links` (bumps
 *      `last_interaction_at` — the 48h customer-service-message
 *      window is measured from there).
 *   4. Log the message / event into `wechat_messages`.
 *   5. Respond with an empty body (Tencent's "no passive reply").
 *
 * We do NOT generate an AI reply here. That path is async — the
 * message log gets picked up by the same automation that drives SMS/
 * email AI replies. Reusing that pipeline keeps WeChat messaging
 * consistent with existing compliance + review gates.
 */
export async function POST(req: Request) {
  if (!isEnabled()) {
    return new NextResponse("WeChat integration disabled.", {
      status: 503,
      headers: TEXT_HEADERS,
    });
  }

  const oa = await loadActiveOa();
  if (!oa) {
    return new NextResponse("WeChat OA not configured.", {
      status: 503,
      headers: TEXT_HEADERS,
    });
  }

  const url = new URL(req.url);
  const signature = url.searchParams.get("signature") ?? "";
  const timestamp = url.searchParams.get("timestamp") ?? "";
  const nonce = url.searchParams.get("nonce") ?? "";

  if (
    !verifyTencentSignature({
      token: oa.verification_token,
      timestamp,
      nonce,
      signature,
    })
  ) {
    return new NextResponse("Signature mismatch.", {
      status: 401,
      headers: TEXT_HEADERS,
    });
  }

  const body = await req.text();
  const msg = parseTencentXml(body);
  if (!msg) {
    // Empty 200 — Tencent accepts no-op replies; a 4xx here would
    // trigger their retry loop against malformed input we cannot fix.
    return new NextResponse("", { status: 200, headers: XML_HEADERS });
  }

  const openid = msg.FromUserName;
  const isEvent = msg.MsgType === "event";
  const eventName = msg.Event ?? null;
  // QR scene value appears on subscribe ("qrscene_<val>") and on
  // bare SCAN events ("<val>"). Normalize to just the value.
  const sceneRaw = msg.EventKey ?? null;
  const sceneValue =
    sceneRaw && sceneRaw.startsWith("qrscene_") ? sceneRaw.slice("qrscene_".length) : sceneRaw;

  // 1. Upsert the subscriber. Unsubscribe events clear/stamp
  // unsubscribed_at; re-subscribes clear it again.
  try {
    const now = new Date().toISOString();
    const baseLink: Record<string, unknown> = {
      oa_account_id: oa.id,
      openid,
      last_interaction_at: now,
    };
    if (isEvent && eventName === "subscribe") {
      baseLink.subscribed_at = now;
      baseLink.unsubscribed_at = null;
      if (sceneValue) baseLink.scene_qr_value = sceneValue;
    } else if (isEvent && eventName === "unsubscribe") {
      baseLink.unsubscribed_at = now;
    }

    await supabaseAdmin
      .from("wechat_user_links")
      .upsert(baseLink, { onConflict: "oa_account_id,openid" });
  } catch (err) {
    // Non-fatal — we still want the message logged.
    console.error("[wechat/callback] upsert user_links:", err);
  }

  // 2. Log the message. wechat_msg_id serves as a dedup key via the
  // partial unique index — ON CONFLICT DO NOTHING protects against
  // Tencent retrying an already-processed MsgId.
  try {
    await supabaseAdmin.from("wechat_messages").insert({
      oa_account_id: oa.id,
      openid,
      direction: "inbound",
      msg_type: msg.MsgType,
      event_type: eventName,
      content: msg.Content ?? null,
      wechat_msg_id: msg.MsgId ?? null,
      raw_payload: msg.raw,
      status: "received",
    });
  } catch (err) {
    // Unique-constraint violations on retried MsgIds are expected and
    // safe to swallow; anything else deserves a log line.
    const message = err instanceof Error ? err.message : String(err);
    if (!/duplicate key value/i.test(message)) {
      console.error("[wechat/callback] insert message:", message);
    }
  }

  // 3. Reply empty — no passive reply for now. When template-message
  // flows land, this stays the same; outbound replies go through
  // Tencent's customer-service-message API instead of passive reply.
  return new NextResponse("", { status: 200, headers: XML_HEADERS });
}
