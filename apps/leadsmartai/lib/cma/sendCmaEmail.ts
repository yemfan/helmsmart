import "server-only";

import { sendEmail } from "@/lib/email";
import { supabaseAdmin } from "@/lib/supabase/admin";

import { buildCmaPdf, type CmaPdfAgentIdentity } from "./buildCmaPdf";
import { loadAgentIdentity } from "./loadAgentIdentity";
import { renderCmaEmail } from "./emailTemplate";
import type { CmaFullRow } from "./service";

/**
 * Server orchestrator for the "send CMA to seller" workflow.
 *
 * Pulls agent identity (display name, email, brokerage) for the
 * sign-off + reply-to header, renders the HTML/text bodies via the
 * pure email template, builds the PDF attachment via the existing
 * buildCmaPdf renderer, and dispatches via the existing Resend wrapper.
 *
 * The entire flow is best-effort beyond the network call to Resend —
 * if the agent has no email on file, the send falls back to the
 * platform default sender. The seller still gets the email; the
 * reply-to just won't route back to the agent automatically.
 */

export type SendCmaEmailInput = {
  cma: CmaFullRow;
  /** Seller email — required, validated upstream. */
  to: string;
  /** Optional cover-note from the agent. May be empty. */
  agentMessage: string;
};

export type SendCmaEmailResult =
  | { ok: true; emailId: string | null }
  | { ok: false; error: string };

/**
 * Narrowing predicate — TypeScript with `strict: false` doesn't narrow
 * a discriminated union on `!result.ok`, so callers need this to access
 * `.error` after a failure check. Same pattern as `isSmartCmaFailure`
 * in fetchSmartCma.ts.
 */
export function isSendCmaEmailFailure(
  r: SendCmaEmailResult,
): r is { ok: false; error: string } {
  return r.ok === false;
}

export async function sendCmaEmail(input: SendCmaEmailInput): Promise<SendCmaEmailResult> {
  const { cma, to, agentMessage } = input;

  if (!isLikelyEmail(to)) {
    return { ok: false, error: "Recipient email is invalid." };
  }

  const agentIdentity = await loadAgentIdentity(cma.agentId);
  const sellerFirstName = await loadSellerFirstName(cma.contactId);

  const rendered = renderCmaEmail({
    agentMessage,
    agentDisplayName: buildAgentDisplayName(agentIdentity),
    sellerFirstName,
    cmaTitle: cma.title || cma.subjectAddress,
    snapshot: cma.snapshot,
  });

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = buildCmaPdf({
      snapshot: cma.snapshot,
      title: cma.title,
      agent: agentIdentity,
      generatedAtIso: cma.createdAt,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "PDF render failed";
    return { ok: false, error: msg };
  }

  const filenameSlug =
    cma.subjectAddress
      .replace(/[^a-z0-9]+/gi, "-")
      .toLowerCase()
      .slice(0, 60) || "cma";
  const attachmentFilename = `cma-${filenameSlug}-${cma.createdAt.slice(0, 10)}.pdf`;

  // Reply-to: route seller replies back to the agent's mailbox even
  // when we send FROM the platform default (RESEND_FROM_EMAIL).
  const replyTo = agentIdentity.email ?? undefined;

  try {
    const sent = await sendEmail({
      to,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      replyTo,
      attachments: [
        {
          filename: attachmentFilename,
          contentType: "application/pdf",
          content: pdfBytes,
        },
      ],
    });
    return { ok: true, emailId: sent?.id ?? null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Email send failed";
    return { ok: false, error: msg };
  }
}

/**
 * Predicate so callers can pre-validate. Kept loose intentionally —
 * Resend will reject invalid addresses with a more authoritative
 * message; this just blocks empty / obviously-broken inputs.
 */
function isLikelyEmail(s: string): boolean {
  const trimmed = s.trim();
  if (trimmed.length === 0) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

function buildAgentDisplayName(agent: CmaPdfAgentIdentity): string {
  if (agent.name && agent.brokerage) {
    return `${agent.name} · ${agent.brokerage}`;
  }
  if (agent.name) return agent.name;
  if (agent.brokerage) return agent.brokerage;
  return "your agent";
}

async function loadSellerFirstName(contactId: string | null): Promise<string | null> {
  if (!contactId) return null;
  try {
    const { data } = await supabaseAdmin
      .from("contacts")
      .select("first_name")
      .eq("id", contactId)
      .maybeSingle();
    const row = data as { first_name: string | null } | null;
    return row?.first_name ?? null;
  } catch {
    return null;
  }
}
