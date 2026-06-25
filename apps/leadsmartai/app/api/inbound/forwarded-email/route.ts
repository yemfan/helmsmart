import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getInboundDomain } from "@/lib/inbound/aliases";
import { verifySvixSignature } from "@/lib/email-tracking/svix";
import type { InboundAttachmentMeta } from "@/lib/inbound/deliveries";
import { processInboundEmail } from "@/lib/inbound/processInbound";

export const runtime = "nodejs";
// AI PDF extraction on dense purchase agreements is 15-40s; 60s covers
// classify + extract + DB writes with headroom.
export const maxDuration = 60;

/**
 * POST /api/inbound/forwarded-email
 *
 * Resend Inbound Email webhook (Svix-signed JSON, `email.received`). Parses
 * the Resend payload and hands it to the shared processInboundEmail pipeline.
 * (The SendGrid Inbound Parse route does the same with multipart bytes.)
 */

type ResendInboundAttachment = {
  filename?: string;
  content_type?: string;
  content_url?: string;
};

type ResendInboundData = {
  id?: string;
  from?: string;
  to?: string[];
  subject?: string;
  text?: string;
  attachments?: ResendInboundAttachment[];
};

type ResendInboundPayload = {
  type?: string;
  data?: ResendInboundData;
};

function pickLocalPart(toList: string[] | undefined, domain: string): string | null {
  if (!toList || toList.length === 0) return null;
  const domainSuffix = `@${domain.toLowerCase()}`;
  for (const raw of toList) {
    if (typeof raw !== "string") continue;
    const angle = raw.match(/<([^>]+)>/);
    const addr = (angle ? angle[1] : raw).trim().toLowerCase();
    if (addr.endsWith(domainSuffix)) return addr.slice(0, -domainSuffix.length);
  }
  return null;
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const h = await headers();

  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET ?? "";
  if (!secret) {
    console.error("[inbound] RESEND_INBOUND_WEBHOOK_SECRET not configured");
    return NextResponse.json({ ok: false, error: "not configured" }, { status: 500 });
  }

  const verification = verifySvixSignature({
    secret,
    rawBody,
    svixId: h.get("svix-id"),
    svixTimestamp: h.get("svix-timestamp"),
    svixSignature: h.get("svix-signature"),
  });
  if (!verification.ok) {
    console.warn("[inbound] svix rejected:", verification.reason);
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }

  let payload: ResendInboundPayload;
  try {
    payload = JSON.parse(rawBody) as ResendInboundPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  if (payload.type !== "email.received") {
    return NextResponse.json({ ok: true, ignored: true, reason: "non-receive-event" });
  }

  const data = payload.data ?? {};
  const localPart = pickLocalPart(data.to, getInboundDomain());
  if (!localPart) {
    return NextResponse.json({ ok: true, accepted: false, reason: "to-mismatch" });
  }

  const attachments: InboundAttachmentMeta[] = (Array.isArray(data.attachments) ? data.attachments : []).map(
    (a) => ({
      filename: a.filename ?? null,
      content_type: a.content_type ?? null,
      content_url: a.content_url ?? null,
    }),
  );

  const result = await processInboundEmail({
    localPart,
    fromHeader: data.from ?? null,
    toHeader: (data.to ?? []).join(", ") || null,
    subject: data.subject ?? null,
    text: data.text ?? null,
    messageId: data.id ?? null,
    attachments,
  });

  // 500 → Resend retries (we'd rather retry than drop the email).
  if (!result.ok) return NextResponse.json(result, { status: 500 });
  return NextResponse.json(result);
}
