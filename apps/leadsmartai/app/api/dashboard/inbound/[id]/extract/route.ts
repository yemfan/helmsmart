import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import {
  getInboundDeliveryForAgent,
  updateInboundExtraction,
} from "@/lib/inbound/deliveries";
import { attemptExtraction } from "@/lib/inbound/extractFromAttachments";
import { isAnthropicConfigured } from "@/lib/anthropic";
import { agentUiLocale } from "@/lib/i18n/agentLocale";

export const runtime = "nodejs";
// Same headroom as the /offers/parse-pdf endpoint — Claude PDF
// extraction is the bottleneck.
export const maxDuration = 60;

/**
 * POST /api/dashboard/inbound/[id]/extract
 *
 * Re-runs (or first-runs) AI extraction for an inbound email
 * delivery. Surfaces as the "Retry extraction" button on the review
 * page when the original webhook attempt failed (e.g. Resend's signed
 * URL hadn't propagated, or Claude was rate-limited).
 *
 * Idempotent: writes the new status into the delivery row regardless
 * of previous state. If the agent re-runs and the second attempt
 * fails, we keep the failure as the latest state — better than
 * stranding them with a stale "extracted" status that doesn't match
 * the source.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const { id } = await ctx.params;

    if (!isAnthropicConfigured()) {
      return NextResponse.json(
        { ok: false, error: "AI extraction isn't enabled on this environment." },
        { status: 503 },
      );
    }

    const delivery = await getInboundDeliveryForAgent(String(agentId), id);
    if (!delivery) {
      return NextResponse.json(
        { ok: false, error: "not found" },
        { status: 404 },
      );
    }

    const result = await attemptExtraction({
      locale: await agentUiLocale(String(agentId)),
      intent: delivery.intent,
      attachments: delivery.attachments_json ?? [],
      // Re-pass the stored subject + text-preview so retries on
      // showing-request emails can re-run the text-based extractor.
      // text_preview is truncated to 2000 chars at write-time (per the
      // webhook), which is well within the 8KB the extractor reads.
      subject: delivery.subject,
      text: delivery.text_preview,
    });

    if (result.status === "extracted") {
      await updateInboundExtraction(delivery.id, {
        status: "extracted",
        extraction: result.payload,
      });
    } else if (result.status === "failed") {
      await updateInboundExtraction(delivery.id, {
        status: "failed",
        error: result.error,
      });
    } else {
      await updateInboundExtraction(delivery.id, { status: "skipped" });
    }

    const refreshed = await getInboundDeliveryForAgent(String(agentId), id);
    return NextResponse.json({ ok: true, delivery: refreshed });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    console.error("POST /api/dashboard/inbound/[id]/extract:", e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
