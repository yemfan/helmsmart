import "server-only";

import { getAgentMessageSettingsEffective } from "@/lib/agent-messaging/settings";
import type { AgentMessageSettingsEffective } from "@/lib/agent-messaging/types";
import { supabaseAdmin } from "@/lib/supabase/admin";

import {
  BOTH_HIGH_CADENCE,
  BOTH_HIGH_CADENCE_KEY,
  computeNextDueAt,
  getStepAt,
  renderStepBody,
  renderStepSubject,
  type DripStep,
} from "./cadence";
import { resolveDraftStatusForDrip } from "./draftStatus";
import {
  decideSendOutcome,
  type ContactSendContext,
  type SendDecision,
} from "./sendDecision";

/**
 * Send-pipeline processor for the sphere drip.
 *
 * Wires the cadence into the existing message-drafts pipeline rather than
 * sending Twilio/email directly:
 *   * For each due active enrollment, render the current step + insert
 *     a `message_drafts` row.
 *   * Resolve `status` via the agent's effective review policy (same
 *     resolveDraftStatus logic the scheduler uses) so autosend agents
 *     get drafts auto-marked 'approved' for the next sphere-drafts-sender
 *     tick to deliver, and review agents get them 'pending' in the queue.
 *   * Advance `current_step` + stamp `last_sent_at` + recompute
 *     `next_due_at` afterward. The advance uses a CAS-style update
 *     (filtering on the original `current_step` value) so two cron ticks
 *     that race can't double-send.
 *
 * Channel-DNC + missing-field gating happens in the pure decider
 * (sendDecision.ts) so we don't pollute the drafts queue with rows the
 * existing dispatcher would just immediately fail.
 */

type EnrollmentRow = {
  id: string;
  agent_id: string | number;
  contact_id: string;
  current_step: number;
  next_due_at: string | null;
  enrolled_at: string;
  last_sent_at: string | null;
  status: string;
};

type ContactRow = {
  id: string;
  phone: string | null;
  email: string | null;
  do_not_contact_sms: boolean | null;
  do_not_contact_email: boolean | null;
  first_name: string | null;
  property_address: string | null;
};

type AgentRow = {
  id: string | number;
  first_name: string | null;
};

export type SendProcessorOutcome =
  | { kind: "drafted"; enrollmentId: string; draftId: string; channel: DripStep["channel"]; stepIndex: number }
  | { kind: "skipped"; enrollmentId: string; reason: SendDecision["kind"] | "claim_failed" | "internal_error"; detail?: string }
  | { kind: "exited"; enrollmentId: string; reason: string }
  | { kind: "completed"; enrollmentId: string };

export type SendProcessorAgentResult = {
  agentId: string;
  due: number;
  drafted: number;
  skipped: number;
  exited: number;
  completed: number;
  outcomes: SendProcessorOutcome[];
};

export async function processSphereDripSendsForAgent(
  agentId: string,
  opts: { dryRun?: boolean; nowIso?: string } = {},
): Promise<SendProcessorAgentResult> {
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const dryRun = Boolean(opts.dryRun);

  const due = await fetchDueActiveEnrollments(agentId, nowIso);

  const result: SendProcessorAgentResult = {
    agentId,
    due: due.length,
    drafted: 0,
    skipped: 0,
    exited: 0,
    completed: 0,
    outcomes: [],
  };

  if (due.length === 0) return result;

  // Cache agent settings + agent first name once per run — both are stable
  // across the batch.
  const settings = await getAgentMessageSettingsEffective(agentId);
  const agentRow = await fetchAgent(agentId);

  // Bulk-load the contacts we need.
  const contactIds = [...new Set(due.map((e) => e.contact_id))];
  const contactsById = await fetchContacts(contactIds);

  for (const enrollment of due) {
    const contact = contactsById.get(enrollment.contact_id);
    if (!contact) {
      result.skipped += 1;
      result.outcomes.push({
        kind: "skipped",
        enrollmentId: enrollment.id,
        reason: "internal_error",
        detail: "contact_missing",
      });
      continue;
    }

    const step = getStepAt(BOTH_HIGH_CADENCE, enrollment.current_step);
    const decision = decideSendOutcome({
      contact: toSendContext(contact),
      step,
      nextDueAt: enrollment.next_due_at,
      nowIso,
    });

    const outcome = await applyDecision({
      enrollment,
      contact,
      step,
      decision,
      settings,
      agent: agentRow,
      nowIso,
      dryRun,
    });

    result.outcomes.push(outcome);
    if (outcome.kind === "drafted") result.drafted += 1;
    else if (outcome.kind === "skipped") result.skipped += 1;
    else if (outcome.kind === "exited") result.exited += 1;
    else if (outcome.kind === "completed") result.completed += 1;
  }

  return result;
}

async function applyDecision(args: {
  enrollment: EnrollmentRow;
  contact: ContactRow;
  step: DripStep | null;
  decision: SendDecision;
  settings: AgentMessageSettingsEffective | null;
  agent: AgentRow | null;
  nowIso: string;
  dryRun: boolean;
}): Promise<SendProcessorOutcome> {
  const { enrollment, contact, step, decision, settings, agent, nowIso, dryRun } = args;
  const enrollmentId = enrollment.id;

  switch (decision.kind) {
    case "skip_no_op":
      return { kind: "skipped", enrollmentId, reason: "skip_no_op", detail: decision.reason };

    case "exit": {
      if (dryRun) return { kind: "exited", enrollmentId, reason: decision.reason };
      const ok = await markEnrollmentExited(enrollment, decision.reason);
      return ok
        ? { kind: "exited", enrollmentId, reason: decision.reason }
        : { kind: "skipped", enrollmentId, reason: "claim_failed" };
    }

    case "skip_advance": {
      if (dryRun) {
        return { kind: "skipped", enrollmentId, reason: "skip_advance", detail: decision.reason };
      }
      // Advance without creating a draft. CAS on current_step keeps double-runs safe.
      const advanced = await advanceEnrollment({
        enrollment,
        nextStepIndex: enrollment.current_step + 1,
        lastSentAt: null, // skipped — don't stamp a send timestamp
        nowIso,
      });
      if (!advanced) return { kind: "skipped", enrollmentId, reason: "claim_failed" };
      return advanced.completed
        ? { kind: "completed", enrollmentId }
        : { kind: "skipped", enrollmentId, reason: "skip_advance", detail: decision.reason };
    }

    case "create_draft": {
      if (!step) {
        return { kind: "skipped", enrollmentId, reason: "internal_error", detail: "missing_step" };
      }

      const body = renderStepBody(step, {
        firstName: contact.first_name,
        agentFirstName: agent?.first_name ?? null,
        propertyAddress: contact.property_address,
      });
      const subject = renderStepSubject(step, {
        firstName: contact.first_name,
        agentFirstName: agent?.first_name ?? null,
      });

      const draftStatus = resolveDraftStatusForDrip({
        reviewPolicy: settings?.effectiveReviewPolicy ?? "review",
        sphereCategory:
          settings?.effectiveReviewPolicyByCategory?.sphere ?? null,
      });

      if (dryRun) {
        return {
          kind: "drafted",
          enrollmentId,
          draftId: "(dry-run)",
          channel: step.channel,
          stepIndex: step.index,
        };
      }

      const draftId = await insertDraft({
        agentId: String(enrollment.agent_id),
        contactId: enrollment.contact_id,
        step,
        subject,
        body,
        draftStatus,
        enrollmentId: enrollment.id,
        cadenceKey: BOTH_HIGH_CADENCE_KEY,
        nowIso,
      });
      if (!draftId) {
        return { kind: "skipped", enrollmentId, reason: "internal_error", detail: "draft_insert_failed" };
      }

      // Advance enrollment AFTER the draft is durable so a crash mid-write
      // re-tries the same step rather than skipping.
      const advanced = await advanceEnrollment({
        enrollment,
        nextStepIndex: enrollment.current_step + 1,
        lastSentAt: nowIso,
        nowIso,
      });
      if (!advanced) {
        // CAS lost the race — another cron beat us. The other cron either
        // already advanced the step or is about to. Drop the duplicate
        // draft we just inserted to avoid the double-send risk.
        await supabaseAdmin.from("message_drafts").delete().eq("id", draftId);
        return { kind: "skipped", enrollmentId, reason: "claim_failed" };
      }

      if (advanced.completed) {
        return { kind: "completed", enrollmentId };
      }

      return {
        kind: "drafted",
        enrollmentId,
        draftId,
        channel: step.channel,
        stepIndex: step.index,
      };
    }
  }
}

async function fetchDueActiveEnrollments(
  agentId: string,
  nowIso: string,
): Promise<EnrollmentRow[]> {
  const { data, error } = await supabaseAdmin
    .from("sphere_drip_enrollments")
    .select(
      "id, agent_id, contact_id, current_step, next_due_at, enrolled_at, last_sent_at, status",
    )
    .eq("agent_id", agentId)
    .eq("status", "active")
    .eq("cadence_key", BOTH_HIGH_CADENCE_KEY)
    .lte("next_due_at", nowIso);
  if (error) {
    console.warn("[sphere-drip-send] fetchDue failed:", error.message);
    return [];
  }
  return (data ?? []) as EnrollmentRow[];
}

async function fetchContacts(contactIds: string[]): Promise<Map<string, ContactRow>> {
  if (contactIds.length === 0) return new Map();
  const { data, error } = await supabaseAdmin
    .from("contacts")
    .select(
      "id, phone, email, do_not_contact_sms, do_not_contact_email, first_name, property_address",
    )
    .in("id", contactIds);
  if (error) {
    console.warn("[sphere-drip-send] fetchContacts failed:", error.message);
    return new Map();
  }
  const out = new Map<string, ContactRow>();
  for (const r of (data ?? []) as ContactRow[]) out.set(r.id, r);
  return out;
}

async function fetchAgent(agentId: string): Promise<AgentRow | null> {
  const { data } = await supabaseAdmin
    .from("agents")
    .select("id, first_name")
    .eq("id", agentId)
    .maybeSingle();
  return (data as AgentRow | null) ?? null;
}

function toSendContext(contact: ContactRow): ContactSendContext {
  return {
    phone: contact.phone,
    email: contact.email,
    doNotContactSms: Boolean(contact.do_not_contact_sms),
    doNotContactEmail: Boolean(contact.do_not_contact_email),
  };
}

async function insertDraft(args: {
  agentId: string;
  contactId: string;
  step: DripStep;
  subject: string | null;
  body: string;
  draftStatus: "pending" | "approved";
  enrollmentId: string;
  cadenceKey: string;
  nowIso: string;
}): Promise<string | null> {
  const templateIdSynth = `${args.cadenceKey}__step_${args.step.index}`;
  const triggerContext = {
    source: "sphere_drip",
    cadence_key: args.cadenceKey,
    step_index: args.step.index,
    step_label: args.step.label,
    enrollment_id: args.enrollmentId,
  };

  const { data, error } = await supabaseAdmin
    .from("message_drafts")
    .insert({
      contact_id: args.contactId,
      template_id: templateIdSynth,
      channel: args.step.channel,
      subject: args.subject,
      body: args.body,
      status: args.draftStatus,
      approved_at: args.draftStatus === "approved" ? args.nowIso : null,
      trigger_context: triggerContext,
    } as never)
    .select("id")
    .single();

  if (error || !data) {
    console.warn("[sphere-drip-send] insertDraft failed:", error?.message);
    return null;
  }
  return (data as { id: string }).id;
}

/**
 * CAS-style advance. Filters the UPDATE on the original `current_step`
 * (and id + cadence_key) so two concurrent cron ticks racing on the
 * same enrollment can't both succeed. The losing run gets a 0-row
 * update and bails — letting the winner's draft be the only one sent.
 */
async function advanceEnrollment(args: {
  enrollment: EnrollmentRow;
  nextStepIndex: number;
  lastSentAt: string | null;
  nowIso: string;
}): Promise<{ completed: boolean } | null> {
  const { enrollment, nextStepIndex, lastSentAt, nowIso } = args;

  const completed = nextStepIndex >= BOTH_HIGH_CADENCE.totalSteps;

  // Compute next_due_at off the most recent send (or current time when
  // we're skip-advancing). When completed, null it out — there's nothing
  // due ever again on this enrollment.
  let nextDueAt: string | null = null;
  if (!completed) {
    nextDueAt = computeNextDueAt(
      BOTH_HIGH_CADENCE,
      nextStepIndex,
      enrollment.enrolled_at,
      lastSentAt ?? enrollment.last_sent_at ?? nowIso,
    );
  }

  const update: Record<string, unknown> = {
    current_step: nextStepIndex,
    next_due_at: nextDueAt,
    status: completed ? "completed" : "active",
  };
  if (lastSentAt) update.last_sent_at = lastSentAt;
  if (completed) update.completed_at = nowIso;

  const { data, error } = await supabaseAdmin
    .from("sphere_drip_enrollments")
    .update(update as never)
    .eq("id", enrollment.id)
    .eq("current_step", enrollment.current_step)
    .eq("cadence_key", BOTH_HIGH_CADENCE_KEY)
    .eq("status", "active")
    .select("id");

  if (error) {
    console.warn("[sphere-drip-send] advance failed:", error.message);
    return null;
  }
  if (!data || data.length === 0) return null;

  return { completed };
}

async function markEnrollmentExited(
  enrollment: EnrollmentRow,
  reason: string,
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("sphere_drip_enrollments")
    .update({ status: "exited", exit_reason: reason } as never)
    .eq("id", enrollment.id)
    .eq("status", "active");
  if (error) {
    console.warn("[sphere-drip-send] exit failed:", error.message);
    return false;
  }
  return true;
}

