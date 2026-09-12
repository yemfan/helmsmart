/**
 * Outbound actions — anything that reaches a customer. The model can only
 * PROPOSE these: `runAction` calls `preview` and parks an approval; `execute`
 * is reachable only from `decideApproval`, after a member said yes.
 *
 * Neither implements sending. A payment reminder is `sendReminderForInvoice`
 * (the same path as the invoice page's button and the dunning cron), and a
 * text is `sendSmsAsOrg` — the one outbound choke point, which checks consent
 * and writes the `messages` row. Mark's are told the send is `ai_team`'s;
 * Emma's reply to a text is the receptionist's (`sent_by` "receptionist").
 */
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decideConsent, type ConsentChannel, type ConsentPurpose } from "@helm/dna-communication";
import { spokenDateTimeLabel } from "@repo/voice/datetime";
import { moneyFormatter } from "@/lib/books-format";
import { calendarDate, daysBetween } from "@/lib/org-date";
import { formatPhoneDisplay } from "@/lib/phone-display";
import { describeDenial, loadConsent } from "@/lib/consent";
import { sendSmsAsOrg, toSendMessageResult } from "@/lib/outbound-send";
import { sendReminderForInvoice, type ReminderInvoice } from "@/lib/invoice-reminders";
import { bookAppointment, getAvailability, getUpcomingAppointment, rescheduleAppointment } from "@/lib/booking";
import { enqueueCalls } from "@/lib/outbound-queue";
import { createServiceClient } from "@/lib/supabase/server";
import { canPublish, providerFor, type Platform } from "@/lib/social-platforms";
import { translatorFor } from "@/lib/i18n/translator";
import type { MessageSender } from "@/lib/message-provenance";
import { ACTION_KEYS, APPROVED_REPLY_INTENT, MESSAGE_MAX, type ApprovalDetails } from "../approval-view";
import { UNPAID_INVOICE_STATUSES, clientName, orgClient, orgInvoice, type OrgClient } from "../entities";
import { defineAction, type ActionContext, type ActionResult, type PreviewResult } from "../types";

const nameOf = (ctx: ActionContext, slug: string) => ctx.team[slug]?.name ?? slug;

/**
 * Why this client can't be reached on this channel right now, or null. Checked
 * when the message or call is PROPOSED so Mark never lines up work for someone
 * who opted out; the send path checks again when it is approved.
 */
async function consentRefusal(
  ctx: ActionContext,
  client: OrgClient,
  channel: ConsentChannel,
  purpose: ConsentPurpose,
): Promise<string | null> {
  try {
    const consent = await loadConsent(ctx.db, ctx.orgId, { clientId: client.id, phone: client.phone });
    const decision = decideConsent(channel, purpose, consent.inputs);
    return decision.allowed ? null : describeDenial(decision, consent, ctx.i18n.clients, ctx.locale);
  } catch (e) {
    // Fail closed: an opt-out we could not read is still an opt-out.
    console.error("[ai-team] consent lookup failed:", e);
    return ctx.i18n.inbox("errors.consentUnavailable");
  }
}

const smsRefusal = (ctx: ActionContext, client: OrgClient, purpose: ConsentPurpose) =>
  consentRefusal(ctx, client, "sms", purpose);

export const sendInvoiceReminder = defineAction({
  key: ACTION_KEYS.sendInvoiceReminder,
  employee: "alex",
  riskClass: "outbound",
  permission: "invoices.write",
  channel: "email",
  description:
    "Propose a payment-reminder email for ONE overdue invoice (with a short text too when the client has a phone and the business has a number). This never sends by itself: it parks a proposal the owner approves or declines in this chat. Get the invoice id from list_overdue_invoices first. One call per invoice.",
  input: z.object({
    invoice_id: z.string().uuid().describe("The invoice's id, from list_overdue_invoices."),
  }),
  subjectOf: (p: { invoice_id: string }) => ({ type: "invoice" as const, id: p.invoice_id }),
  async preview({ invoice_id }, ctx) {
    const t = ctx.i18n.home;
    const inv = await orgInvoice(ctx.db, ctx.orgId, invoice_id);
    if (!inv) {
      return {
        ok: false,
        reason: "No invoice with that id in this business. Use list_overdue_invoices.",
        ownerReason: t("aiApprovals.errors.invoiceGone"),
      };
    }
    if (!UNPAID_INVOICE_STATUSES.includes(inv.status)) {
      return {
        ok: false,
        reason: `${inv.invoice_number} is ${inv.status}, not waiting on payment — there is nothing to remind.`,
        ownerReason: t("aiApprovals.errors.notUnpaid", { invoice: inv.invoice_number }),
      };
    }
    const client = await orgClient(ctx.db, ctx.orgId, inv.client_id);
    if (!client) {
      return {
        ok: false,
        reason: `${inv.invoice_number} has no client in this business to remind.`,
        ownerReason: t("aiApprovals.errors.clientGone"),
      };
    }
    const name = clientName(client);
    if (!client.email) {
      return {
        ok: false,
        reason: `${name} has no email address on file, so a payment reminder can't be sent. Suggest the owner adds one.`,
        ownerReason: t("aiApprovals.errors.noEmail", { name }),
      };
    }
    if (inv.last_reminder_sent_at?.slice(0, 10) === ctx.today) {
      return {
        ok: false,
        reason: `${name} was already reminded about ${inv.invoice_number} today.`,
        ownerReason: t("aiApprovals.errors.remindedToday", { name, invoice: inv.invoice_number }),
      };
    }
    const amount = moneyFormatter(ctx.locale, ctx.currency)(Number(inv.total));
    return {
      ok: true,
      summary: `${nameOf(ctx, "alex")} will email a payment reminder to ${name} for ${inv.invoice_number} · ${amount}`,
      subject: { type: "invoice", id: inv.id },
      details: {
        kind: "invoice_reminder",
        clientId: client.id,
        clientName: name,
        email: client.email,
        phone: client.phone ? formatPhoneDisplay(client.phone) : null,
        invoiceId: inv.id,
        invoiceNumber: inv.invoice_number,
        amount: Number(inv.total),
        currency: ctx.currency,
        daysOverdue: daysBetween(inv.due_date, ctx.today),
      },
    };
  },
  async execute({ invoice_id }, ctx) {
    const t = ctx.i18n.home;
    // Everything re-read and re-checked: the approval may be days old.
    const inv = await orgInvoice(ctx.db, ctx.orgId, invoice_id);
    if (!inv) return { status: "rejected", reason: t("aiApprovals.errors.invoiceGone") };
    if (!UNPAID_INVOICE_STATUSES.includes(inv.status)) {
      return { status: "rejected", reason: t("aiApprovals.errors.notUnpaid", { invoice: inv.invoice_number }) };
    }
    const client = await orgClient(ctx.db, ctx.orgId, inv.client_id);
    if (!client) return { status: "rejected", reason: t("aiApprovals.errors.clientGone") };
    const name = clientName(client);
    if (!client.email) return { status: "rejected", reason: t("aiApprovals.errors.noEmail", { name }) };

    const reminder: ReminderInvoice = {
      id: inv.id,
      invoice_number: inv.invoice_number,
      total: Number(inv.total),
      due_date: inv.due_date,
      client_id: client.id,
      reminder_count: inv.reminder_count,
      organization_id: ctx.orgId,
      clients: {
        first_name: client.first_name,
        last_name: client.last_name,
        email: client.email,
        phone: client.phone,
        preferred_language: client.preferred_language,
      },
    };
    let res: { sent: boolean; reason?: string };
    try {
      res = await sendReminderForInvoice(ctx.db, reminder, { today: ctx.today, sentBy: "ai_team" });
    } catch (e) {
      console.error("[ai-team] payment reminder failed:", e);
      return { status: "failed", error: t("aiApprovals.errors.reminderFailed") };
    }
    if (!res.sent) {
      console.warn("[ai-team] payment reminder not sent:", res.reason);
      return { status: "rejected", reason: t("aiApprovals.errors.reminderFailed") };
    }
    return {
      status: "done",
      summary: `Payment reminder emailed to ${name} for ${inv.invoice_number}.`,
      run: {
        status: "succeeded",
        channel: "email",
        subject: { type: "invoice", id: inv.id },
        outcome: { action: ACTION_KEYS.sendInvoiceReminder, invoice_number: inv.invoice_number },
      },
    };
  },
});

export const textClient = defineAction({
  key: ACTION_KEYS.textClient,
  employee: "sarah",
  riskClass: "outbound",
  permission: "clients.write",
  channel: "sms",
  description:
    "Propose a text message (SMS) to ONE client, with the message you drafted. This never sends by itself: it parks the draft for the owner to read, edit and approve in this chat. Look the client up with find_clients first and pass their id; if several match, ask which one instead. Write the message as the business, short and plain, in the client's preferred language when find_clients gives one.",
  input: z.object({
    client_id: z.string().uuid().describe("The client's id, from find_clients."),
    message: z.string().trim().min(1).max(MESSAGE_MAX).describe("The text message exactly as it should go out."),
  }),
  subjectOf: (p: { client_id: string }) => ({ type: "contact" as const, id: p.client_id }),
  applyEdits: (params, edits) => ({
    ...params,
    message: typeof edits.message === "string" ? edits.message : params.message,
  }),
  preview: (params, ctx) =>
    previewText(params, ctx, {
      purpose: "conversation",
      summary: (name, phone) => `${nameOf(ctx, "sarah")} will text ${name} at ${phone}`,
    }),
  execute: (params, ctx) =>
    sendText(params, ctx, {
      action: ACTION_KEYS.textClient,
      sentBy: "ai_team",
      purpose: "conversation",
      done: (name) => `Texted ${name}.`,
    }),
});

// ── Sarah: an AI call, queued the way "Call all" queues one ──────────────────

/** The purposes the outbound queue already understands (`components/outbound-calls.tsx`). */
export const CALL_PURPOSES = ["follow_up", "appointment_reminder", "survey", "promo"] as const;
export type CallPurpose = (typeof CALL_PURPOSES)[number];

/** The two the caller has nothing to say without — the same rule the Voice screen enforces. */
const PURPOSE_NEEDS_NOTE: readonly CallPurpose[] = ["survey", "promo"];

/** For the model's eyes (the owner reads the card's own sentence). */
const PURPOSE_ENGLISH: Record<CallPurpose, string> = {
  follow_up: "a follow-up",
  appointment_reminder: "an appointment reminder",
  survey: "a survey",
  promo: "a promotion",
};

/**
 * Queue one outbound AI call. It does NOT dial: it puts a row in
 * `outbound_call_queue`, and `drainOutboundQueue` — the same dialer behind
 * "Call all" and the reminder cron — places it within the business's calling
 * hours. So an approval at midnight rings the customer at 8am, not at midnight.
 */
export const scheduleAiCall = defineAction({
  key: ACTION_KEYS.scheduleAiCall,
  employee: "sarah",
  riskClass: "outbound",
  permission: "clients.write",
  channel: "voice",
  description:
    "Propose an outbound AI phone call to ONE client: a follow_up, an appointment_reminder, a survey or a promo. This never dials by itself — it parks a proposal the owner approves in this chat, and approved calls are placed only between 8am and 9pm in the business's timezone. Look the client up with find_clients first and pass their id. `survey` and `promo` need a note saying what to ask or offer; for the other two a note is optional but helps.",
  input: z.object({
    client_id: z.string().uuid().describe("The client's id, from find_clients."),
    purpose: z.enum(CALL_PURPOSES).describe("What the call is for."),
    note: z
      .string()
      .trim()
      .max(300)
      .optional()
      .describe("What the caller should cover, in one or two lines. Required for survey and promo."),
  }),
  subjectOf: (p: { client_id: string }) => ({ type: "contact" as const, id: p.client_id }),
  async preview({ client_id, purpose, note }, ctx) {
    const t = ctx.i18n.home;
    const client = await orgClient(ctx.db, ctx.orgId, client_id);
    if (!client) {
      return {
        ok: false,
        reason: "That client id is not a client of this business. Look them up with find_clients.",
        ownerReason: t("aiApprovals.errors.clientGone"),
      };
    }
    const name = clientName(client);
    if (!client.phone) {
      return {
        ok: false,
        reason: `${name} has no phone number on file, so they can't be called.`,
        ownerReason: t("aiApprovals.errors.noPhone", { name }),
      };
    }
    if (PURPOSE_NEEDS_NOTE.includes(purpose) && !note) {
      return {
        ok: false,
        reason: `A ${purpose} call needs a note saying what to ask or offer. Ask the owner what it should cover, then propose again.`,
        ownerReason: t("aiApprovals.errors.callDetailNeeded"),
      };
    }
    // Already a sentence in the owner's language (describeDenial / consentUnavailable).
    const refusal = await consentRefusal(ctx, client, "call", "automated");
    if (refusal) return { ok: false, reason: `${name} can't be called: ${refusal}`, ownerReason: refusal };

    const phone = formatPhoneDisplay(client.phone);
    return {
      ok: true,
      summary: `${nameOf(ctx, "sarah")} will have an AI call ${name} at ${phone} about ${PURPOSE_ENGLISH[purpose]}`,
      subject: { type: "contact", id: client.id },
      details: {
        kind: "call",
        clientId: client.id,
        clientName: name,
        phone,
        callPurpose: purpose,
        note: note ?? null,
      },
    };
  },
  async execute({ client_id, purpose, note }, ctx) {
    const t = ctx.i18n.home;
    const client = await orgClient(ctx.db, ctx.orgId, client_id);
    if (!client) return { status: "rejected", reason: t("aiApprovals.errors.clientGone") };
    const name = clientName(client);
    if (!client.phone) return { status: "rejected", reason: t("aiApprovals.errors.noPhone", { name }) };

    // The queue has no insert policy for a member — it is written by the same
    // service client the Voice screen's "Call all" uses. Everything that
    // decides WHO is called has already been checked on the member's own
    // client, above; the dialer checks consent once more before it rings.
    let queued: number;
    try {
      const service = await createServiceClient();
      queued = await enqueueCalls(service, ctx.orgId, purpose, [client.id], note);
    } catch (e) {
      console.error("[ai-team] queueing an AI call failed:", e);
      return { status: "failed", error: t("aiApprovals.errors.callQueueFailed") };
    }
    if (queued === 0) return { status: "rejected", reason: t("aiApprovals.errors.callAlreadyQueued", { name }) };
    return {
      status: "done",
      summary: `Queued an AI call to ${name}. It goes out in the business's calling hours (8am–9pm).`,
      run: {
        status: "succeeded",
        channel: "voice",
        subject: { type: "contact", id: client.id },
        outcome: { action: ACTION_KEYS.scheduleAiCall, purpose },
      },
    };
  },
});

// ── Emily: a social post, saved the way the composer saves one ───────────────

/**
 * The post text cap — the same one a text gets, so the card's editor, the
 * "too long" sentence and this schema all agree on one number.
 */
const POST_MAX = MESSAGE_MAX;

/** A post is saved as a draft or a schedule. Never "published": `/api/cron/social/publish` owns sending. */
type SocialRow = {
  organization_id: string;
  platform: string;
  content: string;
  tone: string;
  status: "draft" | "scheduled";
  scheduled_at: string | null;
  generated_by_ai: boolean;
  ai_prompt: string | null;
};

/** Which networks this business has actually connected, of those we can publish to. */
async function connectedNetworks(ctx: ActionContext): Promise<Platform[]> {
  const { data, error } = await ctx.db.from("org_oauth_tokens").select("provider").eq("organization_id", ctx.orgId);
  if (error) throw new Error(`social connections lookup failed: ${error.message}`);
  const providers = new Set(((data ?? []) as { provider: string }[]).map((r) => r.provider));
  // Instagram is left out on purpose: its publisher requires an image, and
  // nothing in this chat can attach one.
  return (["linkedin", "facebook", "threads"] as Platform[]).filter(
    (p) => canPublish(p) && providers.has(providerFor(p) ?? ""),
  );
}

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Emily's post. The model writes the words; approving SAVES it — scheduled if
 * the owner asked for a time, otherwise a draft on the Social queue. Nothing
 * here publishes: a scheduled row is sent by `/api/cron/social/publish`, and a
 * draft waits for a person. That is the composer's own contract, and it is why
 * an approval can never put something on a public timeline by surprise.
 */
export const draftSocialPost = defineAction({
  key: ACTION_KEYS.draftSocialPost,
  employee: "emily",
  riskClass: "outbound",
  permission: "campaigns.write",
  channel: "social",
  description:
    "Propose a social post for ONE connected network, with the text you wrote. This never posts by itself: it parks the draft for the owner to read, edit and approve in this chat, and approving SAVES it — scheduled for the time you give, or as a draft in the Social queue when you give none. It is never published straight away. Only networks this business has connected can be used; if the owner names one that isn't connected, say so rather than picking another.",
  input: z.object({
    network: z.string().min(1).max(30).describe("The network: linkedin, facebook or threads."),
    content: z.string().trim().min(1).max(POST_MAX).describe("The post exactly as it should read."),
    scheduled_at: z
      .string()
      .regex(ISO_INSTANT)
      .optional()
      .describe("When it should go out, as an ISO instant with a timezone offset. Leave it out to save a draft."),
    topic: z.string().max(200).optional().describe("What the owner asked for, in a few words — kept with the post."),
  }),
  applyEdits: (params, edits) => ({
    ...params,
    content: typeof edits.message === "string" ? edits.message : params.content,
  }),
  async preview({ network, content, scheduled_at, topic }, ctx) {
    const t = ctx.i18n.home;
    let connected: Platform[];
    try {
      connected = await connectedNetworks(ctx);
    } catch (e) {
      console.error("[ai-team] social connections lookup failed:", e);
      return { ok: false, reason: "Couldn't read this business's social connections.", ownerReason: t("aiApprovals.errors.failed") };
    }
    if (connected.length === 0) {
      return {
        ok: false,
        reason:
          "This business has no social account connected, so nothing can be posted. Tell the owner they can connect one in Settings → Marketing, and offer to leave them a task.",
        ownerReason: t("aiApprovals.errors.socialNotConnected"),
      };
    }
    const target = network.trim().toLowerCase() as Platform;
    if (!connected.includes(target)) {
      return {
        ok: false,
        reason: `${network} isn't connected for this business. Connected right now: ${connected.join(", ")}. Ask the owner which of those to use.`,
        ownerReason: t("aiApprovals.errors.networkNotConnected", { network, connected: connected.join(", ") }),
      };
    }
    if (scheduled_at && Date.parse(scheduled_at) <= ctx.now.getTime()) {
      return {
        ok: false,
        reason: "That time has already passed. Give a time in the future, or leave it out to save a draft.",
        ownerReason: t("aiApprovals.errors.postTimePast"),
      };
    }
    const when = scheduled_at ?? null;
    return {
      ok: true,
      summary: when
        ? `${nameOf(ctx, "emily")} will schedule a ${target} post for ${when}`
        : `${nameOf(ctx, "emily")} will save a ${target} post as a draft`,
      details: {
        kind: "social",
        network: target,
        message: content,
        scheduledFor: when,
        note: topic ?? null,
      },
    };
  },
  async execute({ network, content, scheduled_at, topic }, ctx) {
    const t = ctx.i18n.home;
    // Re-checked at approval: an account can be disconnected while a proposal waits.
    let connected: Platform[];
    try {
      connected = await connectedNetworks(ctx);
    } catch (e) {
      console.error("[ai-team] social connections lookup failed:", e);
      return { status: "failed", error: t("aiApprovals.errors.failed") };
    }
    const target = network.trim().toLowerCase() as Platform;
    if (connected.length === 0) return { status: "rejected", reason: t("aiApprovals.errors.socialNotConnected") };
    if (!connected.includes(target)) {
      return { status: "rejected", reason: t("aiApprovals.errors.networkNotConnected", { network, connected: connected.join(", ") }) };
    }

    const row: SocialRow = {
      organization_id: ctx.orgId,
      platform: target,
      content,
      tone: "professional",
      status: scheduled_at ? "scheduled" : "draft",
      scheduled_at: scheduled_at ?? null,
      generated_by_ai: true,
      ai_prompt: topic ?? null,
    };
    // `.select()` is load-bearing: through the member's RLS client a refused
    // insert is not an error, it is zero rows — and "saved nothing" must never
    // report as saved.
    const { data, error } = await ctx.db.from("social_posts").insert(row).select("id");
    if (error || !data || data.length === 0) {
      console.error("[ai-team] saving a social post failed:", error?.message ?? "no row written");
      return { status: "failed", error: t("aiApprovals.errors.socialSaveFailed") };
    }
    return {
      status: "done",
      summary: scheduled_at ? `Scheduled a ${target} post for ${scheduled_at}.` : `Saved a ${target} post as a draft.`,
      run: {
        status: "succeeded",
        channel: "social",
        subject: null,
        outcome: { action: ACTION_KEYS.draftSocialPost, network: target, scheduled_at: scheduled_at ?? null },
      },
    };
  },
});

// ── Emma: an appointment, booked through the receptionist's own calendar ─────

/** The slot written out in the business's timezone, as the receptionist says it. */
const slotLabelFor = (startISO: string, timezone: string) => spokenDateTimeLabel(Date.parse(startISO), timezone);

/**
 * The confirmation text the client gets, in THEIR language when we know it —
 * the same courtesy `sendSmsAsOrg` extends to every other message.
 */
function confirmationFor(ctx: ActionContext, client: OrgClient, label: string): string {
  const t = translatorFor(client.preferred_language || ctx.locale, "home");
  return t("aiApprovals.booking.confirmation", { when: label });
}

/** Is `startISO` still one of the openings the availability check offers? */
async function slotIsOpen(ctx: ActionContext, appointmentType: string, startISO: string): Promise<boolean> {
  const date = calendarDate(ctx.timezone, new Date(startISO));
  const availability = await getAvailability(ctx.orgId, appointmentType, date);
  return !availability.closed && availability.slots.some((s) => s.startISO === startISO);
}

/**
 * Book (or move) one appointment. Emma's booking code does the work —
 * `lib/booking.ts`, the same `getAvailability` / `bookAppointment` her phone and
 * SMS tools call, Google Calendar sync included.
 *
 * The slot is checked against availability when the proposal is made AND again
 * when it is approved (`decideApprovalCore` re-runs this preview), so a time
 * someone took in between is refused rather than double-booked — and
 * `bookAppointment` still has the unique index behind it as the last word.
 *
 * When the client already has an appointment coming up, this MOVES it rather
 * than adding a second one, and the card says so before the owner approves.
 */
export const bookAppointmentAction = defineAction({
  key: ACTION_KEYS.bookAppointment,
  employee: "emma",
  riskClass: "outbound",
  permission: "pipeline.write",
  channel: "calendar",
  description:
    "Propose booking an appointment for ONE client at an exact open slot. This never books by itself: it parks a proposal the owner approves in this chat. Find the client with find_clients and the slot with check_availability first, and pass a `start` check_availability returned — never a time you made up. If the client already has an appointment coming up, this MOVES it to the new time instead of adding a second one.",
  input: z.object({
    client_id: z.string().uuid().describe("The client's id, from find_clients."),
    appointment_type: z.string().min(1).max(100).describe("The service, as this business names it (from check_availability)."),
    start: z.string().regex(ISO_INSTANT).describe("The exact `start` of an opening check_availability returned."),
  }),
  subjectOf: (p: { client_id: string }) => ({ type: "contact" as const, id: p.client_id }),
  async preview({ client_id, appointment_type, start }, ctx) {
    const t = ctx.i18n.home;
    const client = await orgClient(ctx.db, ctx.orgId, client_id);
    if (!client) {
      return {
        ok: false,
        reason: "That client id is not a client of this business. Look them up with find_clients.",
        ownerReason: t("aiApprovals.errors.clientGone"),
      };
    }
    const name = clientName(client);
    if (Date.parse(start) <= ctx.now.getTime()) {
      return {
        ok: false,
        reason: "That slot is in the past. Ask check_availability for a later one.",
        ownerReason: t("aiApprovals.errors.slotPast"),
      };
    }
    if (!(await slotIsOpen(ctx, appointment_type, start))) {
      return {
        ok: false,
        reason: "That time is no longer open. Call check_availability again and offer the owner another slot.",
        ownerReason: t("aiApprovals.errors.slotTaken"),
      };
    }

    const label = slotLabelFor(start, ctx.timezone);
    const existing = await getUpcomingAppointment(ctx.orgId, client.id);
    const movesFrom = existing && existing.startISO !== start ? existing.label : null;
    // No phone, or opted out, means no confirmation — and the card says so
    // rather than promising one.
    const refusal = client.phone ? await consentRefusal(ctx, client, "sms", "automated") : null;
    const confirmation = client.phone && !refusal ? confirmationFor(ctx, client, label) : null;

    return {
      ok: true,
      summary: movesFrom
        ? `${nameOf(ctx, "emma")} will move ${name}'s ${appointment_type} from ${movesFrom} to ${label}`
        : `${nameOf(ctx, "emma")} will book ${appointment_type} for ${name} at ${label}`,
      subject: { type: "contact", id: client.id },
      details: {
        kind: "appointment",
        clientId: client.id,
        clientName: name,
        phone: client.phone ? formatPhoneDisplay(client.phone) : null,
        appointmentType: appointment_type,
        slotStart: start,
        slotLabel: label,
        reschedulesFrom: movesFrom,
        message: confirmation,
      },
    };
  },
  async execute({ client_id, appointment_type, start }, ctx) {
    const t = ctx.i18n.home;
    const client = await orgClient(ctx.db, ctx.orgId, client_id);
    if (!client) return { status: "rejected", reason: t("aiApprovals.errors.clientGone") };
    const name = clientName(client);

    const existing = await getUpcomingAppointment(ctx.orgId, client.id);
    const moving = existing && existing.startISO !== start ? existing : null;
    const result = moving
      ? await rescheduleAppointment(ctx.orgId, { eventId: moving.eventId, startISO: start })
      : await bookAppointment(ctx.orgId, {
          appointmentTypeName: appointment_type,
          startISO: start,
          clientId: client.id,
          callerName: name,
        });
    if (!result.ok) {
      // `lib/booking.ts` answers in English for the receptionist's script; the
      // owner gets the one sentence that matters, in their language.
      console.warn("[ai-team] booking refused:", result.reason);
      return { status: "rejected", reason: t("aiApprovals.errors.slotTaken") };
    }

    const label = result.label ?? slotLabelFor(start, ctx.timezone);
    // Best-effort: the appointment is real whether or not the text lands, and
    // `sendSmsAsOrg` refuses on its own if the client opted out in the meantime.
    let confirmed = false;
    if (client.phone) {
      try {
        const outcome = await sendSmsAsOrg(ctx.db, ctx.orgId, {
          clientId: client.id,
          to: client.phone,
          body: confirmationFor(ctx, client, label),
          sentBy: "receptionist",
          purpose: "automated",
        });
        confirmed = outcome.ok;
        if (!outcome.ok) console.warn("[ai-team] booking confirmation not sent:", outcome.reason);
      } catch (e) {
        console.error("[ai-team] booking confirmation failed:", e);
      }
    }
    return {
      status: "done",
      summary: moving ? `Moved ${name}'s appointment to ${label}.` : `Booked ${appointment_type} for ${name} at ${label}.`,
      run: {
        status: "succeeded",
        channel: "calendar",
        subject: { type: "contact", id: client.id },
        outcome: {
          action: ACTION_KEYS.bookAppointment,
          event_id: result.eventId ?? null,
          rescheduled: !!moving,
          confirmation_sent: confirmed,
        },
      },
    };
  },
});

/**
 * Emma's reply to a customer's text, when her autonomy is "act with approval".
 *
 * Not one of Mark's tools: only her autonomy gate proposes it
 * (`receptionistReplyProposal`, called from `lib/workforce-gating.ts` by the
 * Twilio SMS webhook). From there it is an outbound action like any other —
 * the owner reads and may edit the message, and approving runs it through
 * `decideApprovalCore`: the fingerprint check, the permission, the claim.
 * The text goes out as the receptionist's, marked so the AI activity feed
 * lists it once, from the approval.
 */
export const replyToText = defineAction({
  key: ACTION_KEYS.replyToText,
  employee: "emma",
  riskClass: "outbound",
  permission: "clients.write",
  channel: "sms",
  description:
    "Emma's reply to a customer who texted the business, drafted while she needs approval to send. Only her autonomy gate proposes it, and it never sends by itself: the owner reads, edits and approves it.",
  input: z.object({
    client_id: z.string().uuid().describe("The customer who texted in."),
    message: z.string().trim().min(1).max(MESSAGE_MAX).describe("The reply exactly as it should go out."),
  }),
  subjectOf: (p: { client_id: string }) => ({ type: "contact" as const, id: p.client_id }),
  applyEdits: (params, edits) => ({
    ...params,
    message: typeof edits.message === "string" ? edits.message : params.message,
  }),
  preview: (params, ctx) =>
    previewText(params, ctx, {
      purpose: "automated",
      summary: (name, phone) => replySummary(nameOf(ctx, "emma"), name, phone),
      // A reply is only judgeable next to what it answers.
      withIncoming: true,
    }),
  execute: (params, ctx) =>
    sendText(params, ctx, {
      action: ACTION_KEYS.replyToText,
      sentBy: "receptionist",
      purpose: "automated",
      intent: APPROVED_REPLY_INTENT,
      done: (name) => `Replied to ${name}.`,
    }),
});

const replySummary = (who: string, name: string, phone: string) => `${who} will reply to ${name} at ${phone}`;

/** An approval Emma's autonomy gate can park — `reply_to_text` in exactly the shape its preview produces. */
export type ReceptionistReplyProposal = {
  actionKey: string;
  params: { client_id: string; message: string };
  summary: string;
  details: ApprovalDetails;
};

/**
 * Emma's drafted reply as a `reply_to_text` proposal: the params its input
 * schema accepts and the details its preview would produce (same recipient
 * id, number and message — so the three fingerprints agree when the owner
 * approves). Null when there is nothing to propose: not this business's
 * client, no phone on file, an empty draft. The webhook has already checked
 * consent before drafting; the preview checks it again at approval, and the
 * send path once more.
 */
export async function receptionistReplyProposal(
  db: SupabaseClient,
  orgId: string,
  input: { clientId: string; message: string; employeeName: string; incomingMessage?: string | null },
): Promise<ReceptionistReplyProposal | null> {
  const parsed = replyToText.input.safeParse({ client_id: input.clientId, message: input.message.slice(0, MESSAGE_MAX) });
  if (!parsed.success) return null;
  const client = await orgClient(db, orgId, parsed.data.client_id);
  if (!client?.phone) return null;
  const details = textDetails(client, parsed.data.message);
  return {
    actionKey: replyToText.key,
    params: { client_id: parsed.data.client_id, message: parsed.data.message },
    summary: replySummary(input.employeeName, details.clientName, details.phone),
    // The text she is answering, so the owner can judge the answer without
    // opening the inbox. Display only — never part of the fingerprint, because
    // it is not part of what goes out.
    details: { ...details, incomingMessage: incomingContext(input.incomingMessage) },
  };
}

/** The customer's own words, trimmed to a card's worth. */
export const INCOMING_CONTEXT_MAX = 400;

function incomingContext(text: string | null | undefined): string | null {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return null;
  return trimmed.length > INCOMING_CONTEXT_MAX ? `${trimmed.slice(0, INCOMING_CONTEXT_MAX - 1)}…` : trimmed;
}

// ── Texts: the two actions share one preview and one send ────────────────────

type TextParams = { client_id: string; message: string };

/** What a text's card shows and fingerprints: who (the id), the number, the message. */
function textDetails(client: OrgClient, message: string): ApprovalDetails & { clientName: string; phone: string } {
  return {
    kind: "text",
    clientId: client.id,
    clientName: clientName(client),
    phone: formatPhoneDisplay(client.phone),
    message,
  };
}

/**
 * The last thing this customer said to the business, for the card. Best-effort
 * and display-only: a reply is still a reply if we can't show what prompted it.
 */
async function lastInboundText(ctx: ActionContext, clientId: string): Promise<string | null> {
  try {
    const { data, error } = await ctx.db
      .from("messages")
      .select("body")
      .eq("organization_id", ctx.orgId)
      .eq("client_id", clientId)
      .eq("direction", "inbound")
      .order("sent_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    return incomingContext(((data ?? []) as { body: string | null }[])[0]?.body);
  } catch (e) {
    console.error("[ai-team] reading the incoming message failed:", e);
    return null;
  }
}

async function previewText(
  { client_id, message }: TextParams,
  ctx: ActionContext,
  opts: { purpose: ConsentPurpose; summary: (name: string, phone: string) => string; withIncoming?: boolean },
): Promise<PreviewResult> {
  const t = ctx.i18n.home;
  const client = await orgClient(ctx.db, ctx.orgId, client_id);
  if (!client) {
    return {
      ok: false,
      reason: "That client id is not a client of this business. Look them up with find_clients.",
      ownerReason: t("aiApprovals.errors.clientGone"),
    };
  }
  const name = clientName(client);
  if (!client.phone) {
    return {
      ok: false,
      reason: `${name} has no phone number on file, so they can't be texted.`,
      ownerReason: t("aiApprovals.errors.noPhone", { name }),
    };
  }
  // Already a sentence in the owner's language (describeDenial / consentUnavailable).
  const refusal = await smsRefusal(ctx, client, opts.purpose);
  if (refusal) return { ok: false, reason: `${name} can't be texted: ${refusal}`, ownerReason: refusal };
  const details = textDetails(client, message);
  const incomingMessage = opts.withIncoming ? await lastInboundText(ctx, client.id) : null;
  return {
    ok: true,
    summary: opts.summary(name, details.phone),
    subject: { type: "contact", id: client.id },
    details: { ...details, incomingMessage },
  };
}

async function sendText(
  { client_id, message }: TextParams,
  ctx: ActionContext,
  opts: { action: string; sentBy: MessageSender; purpose: ConsentPurpose; intent?: string; done: (name: string) => string },
): Promise<ActionResult> {
  const t = ctx.i18n.home;
  const client = await orgClient(ctx.db, ctx.orgId, client_id);
  if (!client) return { status: "rejected", reason: t("aiApprovals.errors.clientGone") };
  const name = clientName(client);
  if (!client.phone) return { status: "rejected", reason: t("aiApprovals.errors.noPhone", { name }) };

  const outcome = await sendSmsAsOrg(ctx.db, ctx.orgId, {
    clientId: client.id,
    to: client.phone,
    body: message,
    sentBy: opts.sentBy,
    purpose: opts.purpose,
    ...(opts.intent ? { intent: opts.intent } : {}),
  });
  const result = toSendMessageResult(outcome, "sms", {
    inbox: ctx.i18n.inbox,
    clients: ctx.i18n.clients,
    locale: ctx.locale,
  });
  if (!result.ok) {
    // An opt-out is a refusal with a reason the owner can act on; a provider
    // failure is a failure. Either way the sentence is already translated.
    return result.reason === "failed" ? { status: "failed", error: result.error } : { status: "rejected", reason: result.error };
  }
  return {
    status: "done",
    summary: opts.done(name),
    run: {
      status: "succeeded",
      channel: "sms",
      subject: { type: "contact", id: client.id },
      outcome: { action: opts.action },
    },
  };
}
