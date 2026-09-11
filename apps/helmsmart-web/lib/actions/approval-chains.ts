"use server";

import { getServerT } from "@/lib/i18n/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { checkActionPermission } from "@/components/role-guard";
import { createNotificationService } from "@/lib/notifications-service";
import { notifySlackApprovalPending } from "@/lib/integrations/slack";
import { findCurrentPendingStep, computeApprovalTransition } from "@/lib/approval-state";
import { getMemberOrgId } from "@/lib/auth/org-context";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WorkflowStep {
  step_order: number;
  step_name: string;
  approver_role?: string;
  approver_user_id?: string;
  timeout_hours?: number;
}

export interface ApprovalWorkflow {
  id: string;
  name: string;
  description?: string;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  is_active: boolean;
  steps?: WorkflowStep[];
}

// ─── Workflow CRUD ────────────────────────────────────────────────────────────

export async function listApprovalWorkflows(): Promise<ApprovalWorkflow[]> {
  const orgId = await getMemberOrgId();
  if (!orgId) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("approval_workflows")
    .select("*, steps:approval_workflow_steps(*)")
    .eq("organization_id", orgId)
    .order("created_at");

  return (data ?? []) as ApprovalWorkflow[];
}

export async function createApprovalWorkflow(input: {
  name: string;
  description?: string;
  triggerType: string;
  triggerConfig?: Record<string, unknown>;
  steps: WorkflowStep[];
}): Promise<{ ok: boolean; workflowId?: string; error?: string }> {
  const denied = await checkActionPermission("settings.write");
  if (denied) return denied;

  const orgId = await getMemberOrgId();
  if (!orgId) return { ok: false, error: (await getServerT("workflows"))("errors.unauthorized") };

  const db = await createServiceClient();

  const { data: wf, error: wfErr } = await db
    .from("approval_workflows")
    .insert({
      organization_id: orgId,
      name: input.name,
      description: input.description,
      trigger_type: input.triggerType,
      trigger_config: input.triggerConfig ?? {},
    })
    .select("id")
    .single();

  if (wfErr || !wf) {
    return { ok: false, error: wfErr?.message || "Failed to create workflow" };
  }

  // Insert steps
  if (input.steps.length > 0) {
    const { error: stepsErr } = await db.from("approval_workflow_steps").insert(
      input.steps.map((s) => ({
        workflow_id: wf.id,
        organization_id: orgId,
        step_order: s.step_order,
        step_name: s.step_name,
        approver_role: s.approver_role,
        approver_user_id: s.approver_user_id,
        timeout_hours: s.timeout_hours,
      }))
    );
    if (stepsErr) {
      return { ok: false, error: stepsErr.message };
    }
  }

  revalidatePath("/workflows");
  return { ok: true, workflowId: wf.id };
}

export async function updateApprovalWorkflow(
  workflowId: string,
  input: {
    name?: string;
    description?: string;
    isActive?: boolean;
    steps?: WorkflowStep[];
  }
): Promise<{ ok: boolean; error?: string }> {
  const denied = await checkActionPermission("settings.write");
  if (denied) return denied;

  const orgId = await getMemberOrgId();
  if (!orgId) return { ok: false, error: (await getServerT("workflows"))("errors.unauthorized") };

  const db = await createServiceClient();

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description;
  if (input.isActive !== undefined) updates.is_active = input.isActive;

  if (Object.keys(updates).length > 0) {
    const { error } = await db
      .from("approval_workflows")
      .update(updates)
      .eq("id", workflowId)
      .eq("organization_id", orgId);
    if (error) return { ok: false, error: error.message };
  }

  // Replace steps if provided
  if (input.steps) {
    await db
      .from("approval_workflow_steps")
      .delete()
      .eq("workflow_id", workflowId);

    if (input.steps.length > 0) {
      await db.from("approval_workflow_steps").insert(
        input.steps.map((s) => ({
          workflow_id: workflowId,
          organization_id: orgId,
          step_order: s.step_order,
          step_name: s.step_name,
          approver_role: s.approver_role,
          approver_user_id: s.approver_user_id,
          timeout_hours: s.timeout_hours,
        }))
      );
    }
  }

  revalidatePath("/workflows");
  revalidatePath(`/workflows/${workflowId}`);
  return { ok: true };
}

export async function deleteApprovalWorkflow(
  workflowId: string
): Promise<{ ok: boolean; error?: string }> {
  const denied = await checkActionPermission("settings.write");
  if (denied) return denied;

  const orgId = await getMemberOrgId();
  if (!orgId) return { ok: false, error: (await getServerT("workflows"))("errors.unauthorized") };

  const db = await createServiceClient();
  const { error } = await db
    .from("approval_workflows")
    .delete()
    .eq("id", workflowId)
    .eq("organization_id", orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/workflows");
  return { ok: true };
}

// ─── Approval Requests ────────────────────────────────────────────────────────

export async function submitApprovalRequest(input: {
  workflowId: string;
  subjectType: "estimate" | "expense" | "invoice" | "custom";
  subjectId?: string;
  subjectLabel: string;
  subjectData?: Record<string, unknown>;
}): Promise<{ ok: boolean; requestId?: string; error?: string }> {
  const orgId = await getMemberOrgId();
  if (!orgId) return { ok: false, error: (await getServerT("workflows"))("errors.unauthorized") };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: (await getServerT("workflows"))("errors.noSession") };

  const db = await createServiceClient();

  // Get workflow + steps
  const { data: workflow } = await db
    .from("approval_workflows")
    .select("*, steps:approval_workflow_steps(*)")
    .eq("id", input.workflowId)
    .eq("organization_id", orgId)
    .single();

  if (!workflow) return { ok: false, error: (await getServerT("workflows"))("errors.workflowNotFound") };
  if (!workflow.is_active) return { ok: false, error: (await getServerT("workflows"))("errors.workflowInactive") };

  const steps = (workflow.steps ?? []).sort(
    (a: { step_order: number }, b: { step_order: number }) => a.step_order - b.step_order
  );
  if (steps.length === 0) return { ok: false, error: (await getServerT("workflows"))("errors.workflowNoSteps") };

  // Create the approval request
  const { data: request, error: reqErr } = await db
    .from("approval_requests")
    .insert({
      organization_id: orgId,
      workflow_id: input.workflowId,
      subject_type: input.subjectType,
      subject_id: input.subjectId ?? null,
      subject_label: input.subjectLabel,
      subject_data: input.subjectData ?? null,
      requested_by: user.id,
      status: "pending",
      current_step: 1,
    })
    .select("id")
    .single();

  if (reqErr || !request) {
    return { ok: false, error: reqErr?.message || "Failed to create request" };
  }

  // Create step records
  const now = new Date();
  await db.from("approval_request_steps").insert(
    steps.map((step: { id: string; step_order: number; step_name: string; timeout_hours?: number }) => ({
      request_id: request.id,
      organization_id: orgId,
      workflow_step_id: step.id,
      step_order: step.step_order,
      step_name: step.step_name,
      status: step.step_order === 1 ? "pending" : "waiting",
      expires_at: step.timeout_hours
        ? new Date(now.getTime() + step.timeout_hours * 3_600_000).toISOString()
        : null,
    }))
  );

  // Notify the first approver
  const firstStep = steps[0] as { step_name: string; approver_role?: string; approver_user_id?: string };
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  await createNotificationService(orgId, {
    type: "system",
    title: `Approval needed: ${input.subjectLabel}`,
    body: `Step 1 of ${steps.length}: ${firstStep.step_name}`,
    titleKey: "notifications.events.approvalNeeded",
    bodyKey: "notifications.events.approvalNeededBody",
    params: {
      subject: input.subjectLabel,
      total: steps.length,
      step: firstStep.step_name,
    },
    link: `/workflows/requests/${request.id}`,
  });

  void notifySlackApprovalPending(orgId, {
    employeeName: "Workflow",
    description: `${input.subjectLabel} — Step: ${firstStep.step_name}`,
    approvalsUrl: `${appUrl}/workflows/requests/${request.id}`,
  });

  revalidatePath("/workflows");
  return { ok: true, requestId: request.id };
}

export async function respondToApprovalStep(
  requestId: string,
  decision: "approved" | "rejected",
  note?: string
): Promise<{ ok: boolean; error?: string; requestStatus?: string }> {
  const orgId = await getMemberOrgId();
  if (!orgId) return { ok: false, error: (await getServerT("workflows"))("errors.unauthorized") };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: (await getServerT("workflows"))("errors.noSession") };

  const db = await createServiceClient();

  // Get request with current step
  const { data: request } = await db
    .from("approval_requests")
    .select("*, steps:approval_request_steps(*)")
    .eq("id", requestId)
    .eq("organization_id", orgId)
    .single();

  if (!request) return { ok: false, error: (await getServerT("workflows"))("errors.requestNotFound") };
  if (request.status !== "pending") return { ok: false, error: (await getServerT("workflows"))("errors.requestNotPending") };

  const steps = request.steps as Array<{ id: string; step_order: number; status: string }>;
  const currentStepRecord = findCurrentPendingStep(steps, request.current_step);

  if (!currentStepRecord) return { ok: false, error: (await getServerT("workflows"))("errors.noPendingStep") };

  const now = new Date().toISOString();

  // Record decision on current step
  await db
    .from("approval_request_steps")
    .update({
      status: decision,
      decided_by: user.id,
      decided_at: now,
      note: note || null,
    })
    .eq("id", currentStepRecord.id);

  // Pure state-machine decision (unit-tested in lib/approval-state.test.ts)
  const transition = computeApprovalTransition(request.current_step, steps, decision);
  const maxStep = steps.reduce((m, s) => Math.max(m, s.step_order), steps[0]?.step_order ?? 1);
  const nextStep = transition.nextStep;

  if (decision === "rejected") {
    // Rejected — close the whole request
    await db
      .from("approval_requests")
      .update({
        status: "rejected",
        final_decided_at: now,
        final_decided_by: user.id,
        rejection_reason: note || null,
      })
      .eq("id", requestId);

    await createNotificationService(orgId, {
      type: "system",
      title: `Approval rejected: ${request.subject_label}`,
      body: note ? `Reason: ${note.slice(0, 100)}` : "No reason given",
      titleKey: "notifications.events.approvalRejected",
      // Two keys rather than one with an empty `reason`: "Motivo:" followed by
      // nothing is not a sentence in any of the three languages.
      bodyKey: note
        ? "notifications.events.approvalRejectedBody"
        : "notifications.events.approvalRejectedNoReason",
      params: {
        subject: request.subject_label,
        reason: note ? note.slice(0, 100) : "",
      },
      link: `/workflows/requests/${requestId}`,
    });

    revalidatePath("/workflows");
    return { ok: true, requestStatus: "rejected" };
  }

  if (transition.requestStatus === "approved") {
    // All steps approved — final approval
    await db
      .from("approval_requests")
      .update({
        status: "approved",
        current_step: maxStep,
        final_decided_at: now,
        final_decided_by: user.id,
      })
      .eq("id", requestId);

    await createNotificationService(orgId, {
      type: "system",
      title: `✅ Approved: ${request.subject_label}`,
      body: `All ${maxStep} approval step${maxStep > 1 ? "s" : ""} completed`,
      titleKey: "notifications.events.approvalApproved",
      bodyKey: "notifications.events.approvalApprovedBody",
      params: { subject: request.subject_label, count: maxStep },
      link: `/workflows/requests/${requestId}`,
    });

    revalidatePath("/workflows");
    return { ok: true, requestStatus: "approved" };
  }

  // Advance to next step
  await db
    .from("approval_request_steps")
    .update({ status: "pending" })
    .eq("request_id", requestId)
    .eq("step_order", nextStep);

  await db
    .from("approval_requests")
    .update({ current_step: nextStep })
    .eq("id", requestId);

  await createNotificationService(orgId, {
    type: "system",
    title: `Approval step ${nextStep}: ${request.subject_label}`,
    body: `Step ${request.current_step} approved. Step ${nextStep} needs your review.`,
    titleKey: "notifications.events.approvalAdvanced",
    bodyKey: "notifications.events.approvalAdvancedBody",
    params: {
      subject: request.subject_label,
      step: nextStep,
      previous: request.current_step,
    },
    link: `/workflows/requests/${requestId}`,
  });

  revalidatePath("/workflows");
  return { ok: true, requestStatus: "pending" };
}

export async function listApprovalRequests(status?: string) {
  const orgId = await getMemberOrgId();
  if (!orgId) return [];

  const supabase = await createClient();

  let query = supabase
    .from("approval_requests")
    .select(
      "id, subject_type, subject_label, status, current_step, requested_at, requested_by"
    )
    .eq("organization_id", orgId)
    .order("requested_at", { ascending: false })
    .limit(100);

  if (status) query = query.eq("status", status);

  const { data } = await query;
  return data ?? [];
}

export async function getApprovalRequest(requestId: string) {
  const orgId = await getMemberOrgId();
  if (!orgId) return null;

  const supabase = await createClient();

  const { data } = await supabase
    .from("approval_requests")
    .select(
      `*, steps:approval_request_steps(*),
       workflow:approval_workflows(name, id)`
    )
    .eq("id", requestId)
    .eq("organization_id", orgId)
    .single();

  return data;
}
