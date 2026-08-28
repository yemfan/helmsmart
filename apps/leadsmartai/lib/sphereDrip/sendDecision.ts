import type { DripStep } from "./cadence";
import { contactSmsNumber } from "@/lib/contacts/smsNumber";

/**
 * Pure decider for what the send-pipeline processor should do with a single
 * due enrollment + step. Lives separately from `sendProcessor.ts` so vitest
 * can hit it without the supabase shim.
 *
 * Outcome contract:
 *
 *   create_draft   — render the step + insert a message_draft. Caller
 *                    advances current_step + last_sent_at.
 *   skip_advance   — channel-specific block (DNC for that channel, or
 *                    contact missing the relevant field). Caller advances
 *                    current_step (so the cadence continues to the next
 *                    step on the OTHER channel) WITHOUT creating a draft.
 *   exit           — terminal: contact has DNC for both channels. The
 *                    cadence has nothing it can ever send to them.
 *                    Caller marks the enrollment status='exited'.
 *   skip_no_op     — defensive: enrollment isn't actually due yet, or the
 *                    cadence is already complete. Caller leaves it alone.
 */
export type ContactSendContext = {
  phone: string | null;
  phoneNumber?: string | null;
  email: string | null;
  doNotContactSms: boolean;
  doNotContactEmail: boolean;
};

export type SendDecision =
  | { kind: "create_draft" }
  | { kind: "skip_advance"; reason: "dnc_channel" | "missing_field" }
  | { kind: "exit"; reason: "dnc_all_channels" }
  | { kind: "skip_no_op"; reason: "no_step" | "not_due" };

export function decideSendOutcome(args: {
  contact: ContactSendContext;
  step: DripStep | null;
  /** When provided, blocks sending if `nextDueAt > nowIso`. */
  nextDueAt: string | null;
  nowIso: string;
}): SendDecision {
  if (!args.step) return { kind: "skip_no_op", reason: "no_step" };
  if (args.nextDueAt && args.nextDueAt > args.nowIso) {
    return { kind: "skip_no_op", reason: "not_due" };
  }

  // If both channels are blocked, the cadence will never deliver anything
  // — exit the enrollment outright rather than churning the cron.
  const smsBlocked = args.contact.doNotContactSms;
  const emailBlocked = args.contact.doNotContactEmail;
  if (smsBlocked && emailBlocked) {
    return { kind: "exit", reason: "dnc_all_channels" };
  }

  if (args.step.channel === "sms") {
    if (smsBlocked) return { kind: "skip_advance", reason: "dnc_channel" };
    // Both columns: `contacts` stores the same number in either `phone` or
    // `phone_number` depending on which screen or import created the row, so
    // judging on one silently drops contacts who are perfectly reachable.
    if (!contactSmsNumber({ phone: args.contact.phone, phone_number: args.contact.phoneNumber })) {
      return { kind: "skip_advance", reason: "missing_field" };
    }
    return { kind: "create_draft" };
  }

  // email
  if (emailBlocked) return { kind: "skip_advance", reason: "dnc_channel" };
  if (!args.contact.email || !args.contact.email.trim()) {
    return { kind: "skip_advance", reason: "missing_field" };
  }
  return { kind: "create_draft" };
}
