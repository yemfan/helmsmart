import { NextResponse } from "next/server";
import { getInboundDomain } from "@/lib/inbound/aliases";
import type { InboundAttachmentMeta } from "@/lib/inbound/deliveries";
import { processInboundEmail } from "@/lib/inbound/processInbound";

export const runtime = "nodejs";
// AI PDF extraction on dense purchase agreements is 15-40s.
export const maxDuration = 60;

/**
 * POST /api/inbound/sendgrid?k=<INBOUND_PARSE_SECRET>
 *
 * SendGrid Inbound Parse webhook. Unlike Resend, SendGrid POSTs
 * multipart/form-data with attachment FILES in-band (not signed URLs) and
 * doesn't sign the request — so we gate on a secret in the URL. Normalizes
 * the payload and hands it to the shared processInboundEmail pipeline.
 *
 * Setup: point SendGrid Inbound Parse for the inbound subdomain (e.g.
 * inbox.realtybossai.com, MX → mx.sendgrid.net) at this URL with ?k=<secret>.
 */

/** Extract the alias local_part from a recipient address for our inbound domain. */
function localPartForDomain(addr: string, domain: string): string | null {
  const angle = addr.match(/<([^>]+)>/);
  const clean = (angle ? angle[1] : addr).trim().toLowerCase();
  const suffix = `@${domain.toLowerCase()}`;
  return clean.endsWith(suffix) ? clean.slice(0, -suffix.length) : null;
}

/** Find the recipient on our inbound domain from SendGrid's `envelope`/`to`. */
function pickLocalPart(form: FormData, domain: string): string | null {
  // `envelope` is the real RCPT TO (JSON: {"to":["x@…"],"from":"…"}).
  const envelopeRaw = form.get("envelope");
  if (typeof envelopeRaw === "string" && envelopeRaw.trim()) {
    try {
      const env = JSON.parse(envelopeRaw) as { to?: unknown };
      const list = Array.isArray(env.to) ? env.to : [];
      for (const raw of list) {
        if (typeof raw !== "string") continue;
        const lp = localPartForDomain(raw, domain);
        if (lp) return lp;
      }
    } catch {
      /* fall through to the To header */
    }
  }
  // Fall back to the To header (may contain multiple, comma-separated).
  const toRaw = form.get("to");
  if (typeof toRaw === "string") {
    for (const part of toRaw.split(",")) {
      const lp = localPartForDomain(part, domain);
      if (lp) return lp;
    }
  }
  return null;
}

function isFile(v: FormDataEntryValue): v is File {
  return typeof v === "object" && v !== null && "arrayBuffer" in v && "name" in v;
}

export async function POST(req: Request) {
  const secret = process.env.INBOUND_PARSE_SECRET ?? "";
  if (!secret) {
    console.error("[inbound/sendgrid] INBOUND_PARSE_SECRET not configured");
    return NextResponse.json({ ok: false, error: "not configured" }, { status: 500 });
  }
  if (new URL(req.url).searchParams.get("k") !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "bad form" }, { status: 400 });
  }

  const domain = getInboundDomain();
  const localPart = pickLocalPart(form, domain);
  if (!localPart) {
    // Diagnostic: surface what recipient SendGrid actually delivered vs the
    // domain we're matching against, so a misrouted test forward is obvious
    // in the logs instead of a silent 200.
    console.warn(
      `[inbound/sendgrid] to-mismatch domain=${domain} envelope=${String(
        form.get("envelope") ?? "",
      ).slice(0, 200)} to=${String(form.get("to") ?? "").slice(0, 200)}`,
    );
    return NextResponse.json({ ok: true, accepted: false, reason: "to-mismatch" });
  }

  const str = (k: string): string | null => {
    const v = form.get(k);
    return typeof v === "string" && v.trim() ? v : null;
  };

  // Collect attachment files; capture the first PDF's bytes for extraction.
  const attachments: InboundAttachmentMeta[] = [];
  let pdfBytes: Uint8Array | null = null;
  for (const [, value] of form.entries()) {
    if (!isFile(value)) continue;
    const filename = value.name || null;
    const contentType = value.type || null;
    attachments.push({ filename, content_type: contentType, content_url: null });
    const isPdf =
      (contentType ?? "").toLowerCase().includes("pdf") ||
      (filename ?? "").toLowerCase().endsWith(".pdf");
    if (isPdf && !pdfBytes) {
      try {
        pdfBytes = new Uint8Array(await value.arrayBuffer());
      } catch {
        /* leave null — extractor will skip */
      }
    }
  }

  const result = await processInboundEmail({
    localPart,
    fromHeader: str("from"),
    toHeader: str("to"),
    subject: str("subject"),
    text: str("text"),
    messageId: null,
    attachments,
    pdfBytes,
  });

  // Diagnostic: log the routing outcome so a dropped delivery (unknown
  // alias, rate-limit, insert failure) is visible without re-sending.
  console.log(
    `[inbound/sendgrid] localPart=${localPart} outcome=${JSON.stringify(result)}`,
  );

  // Always 200 to SendGrid Parse — it doesn't retry, and a non-2xx just
  // bounces the original sender. Surface the outcome in the body for logs.
  return NextResponse.json(result);
}
