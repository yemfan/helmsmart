import "server-only";

import {
  countRecentDeliveriesForAlias,
  DEFAULT_DAILY_DELIVERY_CAP,
  findAgentByLocalPart,
  recordInboundDelivery,
} from "@/lib/inbound/aliases";
import { classifyInboundEmail, intentLabel } from "@/lib/inbound/intent";
import { aiClassifyInboundEmail } from "@/lib/inbound/aiClassify";
import { createTask } from "@/lib/crm/pipeline/tasks";
import {
  createInboundDelivery,
  setInboundDeliveryTaskId,
  type InboundAttachmentMeta,
} from "@/lib/inbound/deliveries";
import { attemptExtraction, summarizeExtraction } from "@/lib/inbound/extractFromAttachments";
import { matchSenderToContact } from "@/lib/inbound/matchSenderContact";
import { agentUiLocale } from "@/lib/i18n/agentLocale";

/**
 * Provider-agnostic inbound-email processor. Both webhook routes — Resend
 * Inbound (signed JSON, content_url attachments) and SendGrid Inbound Parse
 * (multipart, inline attachment bytes) — normalize their payload into this
 * shape and call here, so the classify → extract → persist → task pipeline
 * lives in exactly one place.
 */

export type ProcessInboundInput = {
  /** local_part of the alias the email was sent to (before the @). */
  localPart: string;
  fromHeader: string | null;
  toHeader: string | null;
  subject: string | null;
  text: string | null;
  /** Provider message id, when available (Resend). */
  messageId: string | null;
  /** Attachment metadata for storage. content_url is null for SendGrid. */
  attachments: InboundAttachmentMeta[];
  /** First PDF's bytes, when delivered in-band (SendGrid). Enables offer/
   *  listing extraction without a fetchable URL. */
  pdfBytes?: Uint8Array | null;
};

export type ProcessInboundResult =
  | { ok: true; accepted: true; intent: string; deliveryId: string; taskId: string; extractionStatus: string }
  | { ok: true; accepted: false; reason: string }
  | { ok: false; error: string };

export async function processInboundEmail(
  input: ProcessInboundInput,
): Promise<ProcessInboundResult> {
  const alias = await findAgentByLocalPart(input.localPart);
  if (!alias) return { ok: true, accepted: false, reason: "unknown-alias" };

  // Per-alias daily rate limit (guessable friendly slugs → bound abuse).
  const recentCount = await countRecentDeliveriesForAlias(alias.id);
  if (recentCount >= DEFAULT_DAILY_DELIVERY_CAP) {
    console.warn(`[inbound] rate-limited alias=${alias.local_part} count=${recentCount}`);
    return { ok: true, accepted: false, reason: "rate-limited" };
  }

  const subject = (input.subject ?? "").trim() || null;
  const text = input.text ?? null;
  const fromHeader = input.fromHeader ?? null;
  const toLine = input.toHeader ?? null;
  const attachments = input.attachments ?? [];
  const pdfAttachments = attachments.filter(
    (a) =>
      (a.content_type ?? "").toLowerCase().includes("pdf") ||
      (a.filename ?? "").toLowerCase().endsWith(".pdf"),
  );
  const hasPdfAttachment = pdfAttachments.length > 0 || Boolean(input.pdfBytes?.byteLength);

  // Intent: deterministic keyword pass, then a Claude-haiku overlay when the
  // keyword pass is unsure but there's signal worth the call.
  let intent = classifyInboundEmail({ subject, text, hasPdfAttachment });
  if (intent === "unknown" && (hasPdfAttachment || (text ?? "").trim().length > 50)) {
    const aiIntent = await aiClassifyInboundEmail({
      subject,
      text,
      attachmentFilenames: pdfAttachments.map((a) => a.filename ?? "").filter(Boolean),
    });
    if (aiIntent && aiIntent !== "unknown") intent = aiIntent;
  }
  const intentText = intentLabel(intent);

  const extractionResult = await attemptExtraction({
    intent,
    attachments,
    // Webhook path: no request cookie, so the agent's saved language.
    locale: await agentUiLocale(String(alias.agent_id)),
    subject,
    text,
    pdfBytes: input.pdfBytes ?? null,
  });

  const contactMatch = await matchSenderToContact(alias.agent_id, fromHeader);

  let delivery;
  try {
    delivery = await createInboundDelivery({
      aliasId: alias.id,
      agentId: alias.agent_id,
      resendMessageId: input.messageId ?? null,
      intent,
      fromHeader,
      toHeader: toLine,
      subject,
      textPreview: text ? text.slice(0, 2000) : null,
      attachments,
      extractionStatus: extractionResult.status,
      extraction: extractionResult.status === "extracted" ? extractionResult.payload : null,
      extractionError: extractionResult.status === "failed" ? extractionResult.error : null,
      matchedContactId: contactMatch?.id ?? null,
    });
  } catch (e) {
    console.error("[inbound] delivery insert failed:", e);
    return { ok: false, error: "delivery insert failed" };
  }

  // Bridge an extracted offer into the structured listing_offers table when it
  // confidently matches one of the agent's listings — so a forwarded offer email
  // actually populates the offers the compare/summary tools read, instead of
  // only living on the delivery as a review item. Best-effort: never fail the
  // delivery over it.
  let bridgedNote: string | null = null;
  if (
    intent === "offer_received" &&
    extractionResult.status === "extracted" &&
    extractionResult.payload.kind === "offer"
  ) {
    try {
      const { bridgeInboundOfferToListing } = await import("@/lib/listing-offers/fromInbound");
      const bridged = await bridgeInboundOfferToListing({
        agentId: alias.agent_id,
        parsed: extractionResult.payload.data,
        deliveryId: delivery.id,
      });
      if (bridged.created) {
        bridgedNote = "📊 Saved to your listing's offers — open Offers to compare or summarize.";
      }
    } catch (e) {
      console.error("[inbound] offer→listing bridge failed:", e);
    }
  }

  const senderShort = fromHeader
    ? fromHeader.replace(/<[^>]+>/, "").trim() || fromHeader
    : "an email forward";
  const extractionSummary =
    extractionResult.status === "extracted" ? summarizeExtraction(extractionResult.payload) : null;
  const titleSuffix = extractionSummary ?? subject?.slice(0, 80) ?? `from ${senderShort.slice(0, 60)}`;
  const title = `Review forwarded ${intentText.toLowerCase()}: ${titleSuffix}`;
  // Relative path — resolves against whatever host the agent is on, so a
  // domain change (leadsmart-ai.com → closebossai.com) can never dead-link it.
  // This link is only ever rendered in-app (the task row); it is never sent
  // to an external channel, so it doesn't need an absolute origin.
  const reviewUrl = `/dashboard/inbound/${delivery.id}`;

  const bodyParts: string[] = [`📥 Open the review page: ${reviewUrl}`, ""];
  if (fromHeader) bodyParts.push(`From: ${fromHeader}`);
  if (toLine) bodyParts.push(`To: ${toLine}`);
  if (subject) bodyParts.push(`Subject: ${subject}`);
  if (pdfAttachments.length > 0) {
    bodyParts.push(
      `📎 ${pdfAttachments.length} PDF attachment${pdfAttachments.length === 1 ? "" : "s"}: ${pdfAttachments
        .map((a) => a.filename ?? "(unnamed)")
        .join(", ")}`,
    );
  }
  if (extractionResult.status === "extracted") {
    bodyParts.push(`✅ AI extracted ${extractionResult.payload.kind} fields — review on the page above.`);
  }
  if (bridgedNote) bodyParts.push(bridgedNote);
  if (extractionResult.status === "failed") {
    bodyParts.push(`⚠️ AI extraction failed: ${extractionResult.error.slice(0, 200)} (retry on review page)`);
  }
  if (text) {
    bodyParts.push("", text.slice(0, 1500));
    if (text.length > 1500) bodyParts.push(`…(${text.length - 1500} more chars truncated)`);
  }

  try {
    const task = await createTask({
      agentId: alias.agent_id,
      title,
      description: bodyParts.join("\n"),
      priority: intent === "offer_received" || intent === "showing_requested" ? "high" : "normal",
      source: "automation",
    });
    await setInboundDeliveryTaskId(delivery.id, task.id);
    await recordInboundDelivery(alias.id);
    return {
      ok: true,
      accepted: true,
      intent,
      deliveryId: delivery.id,
      taskId: task.id,
      extractionStatus: extractionResult.status,
    };
  } catch (e) {
    console.error("[inbound] task create failed:", e);
    return { ok: false, error: "task create failed" };
  }
}
