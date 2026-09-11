/**
 * Outbound actions — anything that reaches a customer. The model can only
 * PROPOSE these: `runAction` calls `preview` and parks an approval; `execute`
 * is reachable only from `decideApproval`, after a member said yes.
 *
 * Neither implements sending. A payment reminder is `sendReminderForInvoice`
 * (the same path as the invoice page's button and the dunning cron), and a
 * text is `sendSmsAsOrg` — the one outbound choke point, which checks consent
 * and writes the `messages` row. Both are told the send is `ai_team`'s.
 */
import { z } from "zod";
import { decideConsent } from "@helm/dna-communication";
import { moneyFormatter } from "@/lib/books-format";
import { daysBetween } from "@/lib/org-date";
import { formatPhoneDisplay } from "@/lib/phone-display";
import { describeDenial, loadConsent } from "@/lib/consent";
import { sendSmsAsOrg, toSendMessageResult } from "@/lib/outbound-send";
import { sendReminderForInvoice, type ReminderInvoice } from "@/lib/invoice-reminders";
import { ACTION_KEYS, MESSAGE_MAX } from "../approval-view";
import { UNPAID_INVOICE_STATUSES, clientName, orgClient, orgInvoice, type OrgClient } from "../entities";
import { defineAction, type ActionContext } from "../types";

const nameOf = (ctx: ActionContext, slug: string) => ctx.team[slug]?.name ?? slug;

/**
 * Why this client can't be texted right now, or null. Checked when the text is
 * PROPOSED so Mark never lines up a message for someone who opted out; the
 * send path checks again when it is approved.
 */
async function smsRefusal(ctx: ActionContext, client: OrgClient): Promise<string | null> {
  try {
    const consent = await loadConsent(ctx.db, ctx.orgId, { clientId: client.id, phone: client.phone });
    const decision = decideConsent("sms", "conversation", consent.inputs);
    return decision.allowed ? null : describeDenial(decision, consent, ctx.i18n.clients, ctx.locale);
  } catch (e) {
    // Fail closed: an opt-out we could not read is still an opt-out.
    console.error("[ai-team] consent lookup failed:", e);
    return ctx.i18n.inbox("errors.consentUnavailable");
  }
}

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
    const inv = await orgInvoice(ctx.db, ctx.orgId, invoice_id);
    if (!inv) return { ok: false, reason: "No invoice with that id in this business. Use list_overdue_invoices." };
    if (!UNPAID_INVOICE_STATUSES.includes(inv.status)) {
      return { ok: false, reason: `${inv.invoice_number} is ${inv.status}, not waiting on payment — there is nothing to remind.` };
    }
    const client = await orgClient(ctx.db, ctx.orgId, inv.client_id);
    if (!client) return { ok: false, reason: `${inv.invoice_number} has no client in this business to remind.` };
    const name = clientName(client);
    if (!client.email) {
      return { ok: false, reason: `${name} has no email address on file, so a payment reminder can't be sent. Suggest the owner adds one.` };
    }
    if (inv.last_reminder_sent_at?.slice(0, 10) === ctx.today) {
      return { ok: false, reason: `${name} was already reminded about ${inv.invoice_number} today.` };
    }
    const amount = moneyFormatter(ctx.locale, ctx.currency)(Number(inv.total));
    return {
      ok: true,
      summary: `${nameOf(ctx, "alex")} will email a payment reminder to ${name} for ${inv.invoice_number} · ${amount}`,
      subject: { type: "invoice", id: inv.id },
      details: {
        kind: "invoice_reminder",
        clientName: name,
        email: client.email,
        phone: client.phone ? formatPhoneDisplay(client.phone) : null,
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
  async preview({ client_id, message }, ctx) {
    const client = await orgClient(ctx.db, ctx.orgId, client_id);
    if (!client) return { ok: false, reason: "That client id is not a client of this business. Look them up with find_clients." };
    const name = clientName(client);
    if (!client.phone) return { ok: false, reason: `${name} has no phone number on file, so they can't be texted.` };
    const refusal = await smsRefusal(ctx, client);
    if (refusal) return { ok: false, reason: `${name} can't be texted: ${refusal}` };
    const phone = formatPhoneDisplay(client.phone);
    return {
      ok: true,
      summary: `${nameOf(ctx, "sarah")} will text ${name} at ${phone}`,
      subject: { type: "contact", id: client.id },
      details: { kind: "text", clientName: name, phone, message },
    };
  },
  async execute({ client_id, message }, ctx) {
    const t = ctx.i18n.home;
    const client = await orgClient(ctx.db, ctx.orgId, client_id);
    if (!client) return { status: "rejected", reason: t("aiApprovals.errors.clientGone") };
    const name = clientName(client);
    if (!client.phone) return { status: "rejected", reason: t("aiApprovals.errors.noPhone", { name }) };

    const outcome = await sendSmsAsOrg(ctx.db, ctx.orgId, {
      clientId: client.id,
      to: client.phone,
      body: message,
      sentBy: "ai_team",
      purpose: "conversation",
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
      summary: `Texted ${name}.`,
      run: {
        status: "succeeded",
        channel: "sms",
        subject: { type: "contact", id: client.id },
        outcome: { action: ACTION_KEYS.textClient },
      },
    };
  },
});
