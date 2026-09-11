/**
 * Approval Timeout Cron — GET /api/cron/approvals/timeout
 *
 * Runs every 15 minutes.
 * Finds pending approval request steps whose expires_at has passed,
 * marks them as skipped, and advances (or expires) the parent request.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { createNotificationService } from "@/lib/notifications-service";
import { notifySlackApprovalPending } from "@/lib/integrations/slack";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const db = await createServiceClient();
  const now = new Date().toISOString();

  try {
    // Find expired pending steps
    const { data: expiredSteps } = await db
      .from("approval_request_steps")
      .select(
        `id, request_id, step_order, step_name,
         approval_requests!inner(id, organization_id, status, current_step, subject_label)`
      )
      .eq("status", "pending")
      .not("expires_at", "is", null)
      .lte("expires_at", now);

    if (!expiredSteps?.length) {
      return NextResponse.json({ ok: true, processed: 0 });
    }

    let processed = 0;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

    for (const step of expiredSteps) {
      const reqRaw = step.approval_requests;
      const req = (Array.isArray(reqRaw) ? reqRaw[0] : reqRaw) as {
        id: string;
        organization_id: string;
        status: string;
        current_step: number;
        subject_label: string;
      } | null;

      if (!req || req.status !== "pending") continue;

      // Get all steps for this request to find next
      const { data: allSteps } = await db
        .from("approval_request_steps")
        .select("id, step_order, status")
        .eq("request_id", req.id)
        .order("step_order");

      if (!allSteps) continue;

      const maxStep = allSteps[allSteps.length - 1].step_order;
      const nextStep = req.current_step + 1;

      // Mark current step as skipped (timed out)
      await db
        .from("approval_request_steps")
        .update({ status: "skipped" })
        .eq("id", step.id);

      if (nextStep > maxStep) {
        // All steps done (or timed out) — expire the request
        await db
          .from("approval_requests")
          .update({ status: "expired", final_decided_at: now })
          .eq("id", req.id);

        await createNotificationService(req.organization_id, {
          type: "system",
          title: `Approval expired: ${req.subject_label}`,
          body: `Step "${step.step_name}" timed out. The request has expired.`,
          titleKey: "notifications.events.approvalExpired",
          bodyKey: "notifications.events.approvalExpiredBody",
          params: { subject: req.subject_label, step: step.step_name },
          link: `/workflows/requests/${req.id}`,
        });
      } else {
        // Advance to next step
        await db
          .from("approval_request_steps")
          .update({ status: "pending" })
          .eq("request_id", req.id)
          .eq("step_order", nextStep);

        await db
          .from("approval_requests")
          .update({ current_step: nextStep })
          .eq("id", req.id);

        await createNotificationService(req.organization_id, {
          type: "system",
          title: `Approval escalated: ${req.subject_label}`,
          body: `Step "${step.step_name}" timed out. Moved to step ${nextStep}.`,
          titleKey: "notifications.events.approvalEscalated",
          bodyKey: "notifications.events.approvalEscalatedBody",
          params: {
            subject: req.subject_label,
            step: step.step_name,
            next: nextStep,
          },
          link: `/workflows/requests/${req.id}`,
        });

        void notifySlackApprovalPending(req.organization_id, {
          employeeName: "Workflow (escalated)",
          description: `${req.subject_label} — Step ${nextStep} needs review (previous step timed out)`,
          approvalsUrl: `${appUrl}/workflows/requests/${req.id}`,
        });
      }

      processed++;
    }

    return NextResponse.json({ ok: true, processed });
  } catch (error) {
    console.error("[approvals/timeout] error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
