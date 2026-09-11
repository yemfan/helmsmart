/**
 * The one way a text or an email leaves HelmSmart for a client.
 *
 * Every outbound send used to call Twilio or Resend itself and then write its
 * own `messages` row, so there were a dozen places a rule had to be repeated —
 * and the two rules that mattered were in none of them. Nothing checked whether
 * the person had opted out, and nothing recorded who sent the message. This
 * module does both, together, in one place:
 *
 *   1. consent — `decideConsent` over the client's switches and the unsubscribe
 *      tables (see `lib/consent.ts`); a refusal returns before the provider is
 *      called;
 *   2. the send — Twilio (with the shared sender rules) or Resend;
 *   3. an SMS the carrier refuses as unsubscribed (Twilio 21610) is recorded as
 *      an opt-out, so the next attempt is refused here instead;
 *   4. the `messages` row, with `sent_by` saying who or what sent it.
 *
 * A plain module (no "use server"): it takes the Supabase client as an argument
 * — the RLS client from a server action, the service client from a webhook or
 * cron — and returns a typed outcome rather than throwing, so every caller has
 * to decide what a refusal means for it.
 */
import twilio from "twilio";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decideConsent,
  optOutCovers,
  OPT_OUT_REASON,
  type ConsentDenied,
  type ConsentInputs,
  type ConsentPurpose,
} from "@helm/dna-communication";
import { sendEmail, FROM_ADDRESS } from "@/lib/email";
import { normalizePhoneE164 } from "@/lib/phone";
import { twilioSender, twilioStatusCallback } from "@/lib/twilio-sender";
import {
  loadConsent,
  recordSmsOptOut,
  ConsentLookupError,
  describeDenial,
  type ConsentTarget,
  type LoadedConsent,
  type Translate,
} from "@/lib/consent";
import type { MessageSender } from "@/lib/message-provenance";

type Db = SupabaseClient;

/** Twilio: "Attempt to send to unsubscribed recipient." */
export const TWILIO_UNSUBSCRIBED = 21610;

export type SendFailure =
  | { ok: false; reason: "opted_out"; decision: ConsentDenied; consent: LoadedConsent | null }
  | { ok: false; reason: "consent_unavailable" }
  | { ok: false; reason: "invalid_address"; detail: string }
  | { ok: false; reason: "not_configured" }
  | { ok: false; reason: "provider"; code: number | null; detail: string };

export type SendOutcome = { ok: true; externalId: string | null } | SendFailure;

function errorCode(e: unknown): number | null {
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === "number" ? code : null;
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Decide consent for one send. Returns null when the send may go, the failure
 * to return when it may not. `preloaded` skips the lookup for bulk senders that
 * loaded a whole organization's opt-outs once.
 */
async function consentGate(
  db: Db,
  orgId: string,
  target: ConsentTarget,
  channel: "sms" | "email",
  purpose: ConsentPurpose,
  preloaded?: ConsentInputs,
): Promise<{ failure: SendFailure | null; consent: LoadedConsent | null }> {
  if (!optOutCovers(channel, purpose)) return { failure: null, consent: null };
  if (preloaded) {
    const decision = decideConsent(channel, purpose, preloaded);
    return decision.allowed
      ? { failure: null, consent: null }
      : { failure: { ok: false, reason: "opted_out", decision, consent: null }, consent: null };
  }
  try {
    const consent = await loadConsent(db, orgId, target);
    const decision = decideConsent(channel, purpose, consent.inputs);
    return decision.allowed
      ? { failure: null, consent }
      : { failure: { ok: false, reason: "opted_out", decision, consent }, consent };
  } catch (e) {
    // Fail closed: an opt-out we could not read is still an opt-out.
    console.error("[outbound] consent lookup failed; not sending:", e instanceof ConsentLookupError ? e.cause : e);
    return { failure: { ok: false, reason: "consent_unavailable" }, consent: null };
  }
}

export interface GuardedSms {
  db: Db;
  orgId: string;
  /** The client the text is to, when known. Written to the row and used for consent. */
  clientId: string | null;
  to: string;
  body: string;
  /** The org's own number; `twilioSender` decides whether it is actually used. */
  fromNumber: string | null;
  purpose: ConsentPurpose;
  /** Who or what is sending. Omit only for a send that writes no `messages` row (campaigns). */
  sentBy?: MessageSender;
  intent?: string | null;
  /**
   * "business" for a text to the organization's own alert phone — a message to
   * the owner about a client, not to a client, so no client's consent applies.
   */
  recipient?: "client" | "business";
  /** Opt-out inputs already loaded for a bulk send. */
  consentInputs?: ConsentInputs;
}

/** Send one SMS through the consent guard and record it. Never throws. */
export async function sendSmsGuarded(opts: GuardedSms): Promise<SendOutcome> {
  const normalized = normalizePhoneE164(opts.to);
  if (!normalized.ok) return { ok: false, reason: "invalid_address", detail: opts.to };
  const to = normalized.value;

  let consent: LoadedConsent | null = null;
  if (opts.recipient !== "business") {
    const gate = await consentGate(
      opts.db,
      opts.orgId,
      { clientId: opts.clientId, phone: to },
      "sms",
      opts.purpose,
      opts.consentInputs,
    );
    if (gate.failure) return gate.failure;
    consent = gate.consent;
  }

  const sender = twilioSender(opts.fromNumber);
  if (!sender || !process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    return { ok: false, reason: "not_configured" };
  }

  let msg: { sid?: string; from?: string | null };
  try {
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    msg = await client.messages.create({ ...sender, ...twilioStatusCallback(), to, body: opts.body });
  } catch (e) {
    const code = errorCode(e);
    if (code === TWILIO_UNSUBSCRIBED && opts.recipient !== "business") {
      // The carrier is holding a STOP we never saw. Record it so the next send
      // is refused here, with a reason, instead of at Twilio with a code.
      await recordSmsOptOut(opts.db, opts.orgId, to, OPT_OUT_REASON.carrier);
      const decision: ConsentDenied = {
        allowed: false,
        channel: "sms",
        purpose: opts.purpose,
        source: "sms_unsubscribe",
        via: "carrier",
        since: new Date().toISOString(),
      };
      return { ok: false, reason: "opted_out", decision, consent };
    }
    console.error("[outbound] SMS send failed:", { code, error: errorText(e) });
    return { ok: false, reason: "provider", code, detail: errorText(e) };
  }

  if (opts.sentBy) {
    const { error } = await opts.db.from("messages").insert({
      organization_id: opts.orgId,
      client_id: opts.clientId,
      channel: "sms",
      direction: "outbound",
      // What Twilio actually sent from, preferred over what we asked for: with a
      // Messaging Service Twilio picks the number out of the pool.
      from_address: msg.from ?? ("from" in sender ? sender.from : (opts.fromNumber ?? "messaging-service")),
      to_address: to,
      body: opts.body,
      read: true,
      intent: opts.intent ?? null,
      external_id: msg.sid ?? null,
      sent_by: opts.sentBy,
      sent_at: new Date().toISOString(),
    });
    // The text has already gone; a failed log row must not report it as unsent.
    if (error) console.error("[outbound] SMS sent but not recorded:", error);
  }

  return { ok: true, externalId: msg.sid ?? null };
}

export interface GuardedEmail {
  db: Db;
  orgId: string;
  clientId: string | null;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  fromName?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  purpose: ConsentPurpose;
  /** Who or what is sending. Omit for a send that writes no `messages` row. */
  sentBy?: MessageSender;
  /** What the `messages` row shows, when it differs from what was sent. */
  logSubject?: string;
  logBody?: string;
  consentInputs?: ConsentInputs;
}

/** Send one email through the consent guard and record it. Never throws. */
export async function sendEmailGuarded(opts: GuardedEmail): Promise<SendOutcome> {
  const gate = await consentGate(
    opts.db,
    opts.orgId,
    { clientId: opts.clientId, email: opts.to },
    "email",
    opts.purpose,
    opts.consentInputs,
  );
  if (gate.failure) return gate.failure;

  let sent: { id?: string };
  try {
    sent = await sendEmail({
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      fromName: opts.fromName,
      replyTo: opts.replyTo,
      headers: opts.headers,
    });
  } catch (e) {
    return { ok: false, reason: "provider", code: null, detail: errorText(e) };
  }

  if (opts.sentBy) {
    const { error } = await opts.db.from("messages").insert({
      organization_id: opts.orgId,
      client_id: opts.clientId,
      channel: "email",
      direction: "outbound",
      from_address: FROM_ADDRESS,
      to_address: opts.to,
      subject: opts.logSubject ?? opts.subject,
      body: opts.logBody ?? opts.text ?? opts.subject,
      read: true,
      external_id: sent?.id ?? null,
      sent_by: opts.sentBy,
      sent_at: new Date().toISOString(),
    });
    if (error) console.error("[outbound] email sent but not recorded:", error);
  }

  return { ok: true, externalId: sent?.id ?? null };
}

/**
 * An SMS from an organization, resolving its number first. For callers that
 * hold an org id and nothing else — the inbox, the AI panel.
 */
export async function sendSmsAsOrg(
  db: Db,
  orgId: string,
  input: { clientId: string | null; to: string; body: string; sentBy: MessageSender; purpose: ConsentPurpose },
): Promise<SendOutcome> {
  const { data: org } = await db.from("organizations").select("twilio_number").eq("id", orgId).maybeSingle();
  return sendSmsGuarded({
    db,
    orgId,
    clientId: input.clientId,
    to: input.to,
    body: input.body,
    fromNumber: (org as { twilio_number?: string | null } | null)?.twilio_number ?? null,
    purpose: input.purpose,
    sentBy: input.sentBy,
  });
}

// ─── Calls ────────────────────────────────────────────────────────────────────

export type CallGuard =
  | { ok: true }
  | { ok: false; reason: "opted_out"; decision: ConsentDenied; consent: LoadedConsent }
  | { ok: false; reason: "consent_unavailable" };

/** May the product place a call to this client? AI outbound calls and reminder calls ask this. */
export async function guardCall(db: Db, orgId: string, target: ConsentTarget): Promise<CallGuard> {
  try {
    const consent = await loadConsent(db, orgId, target);
    const decision = decideConsent("call", "automated", consent.inputs);
    return decision.allowed ? { ok: true } : { ok: false, reason: "opted_out", decision, consent };
  } catch (e) {
    console.error("[outbound] consent lookup failed; not calling:", e instanceof ConsentLookupError ? e.cause : e);
    return { ok: false, reason: "consent_unavailable" };
  }
}

/** Thrown by `placeOutboundCall` when the guard refuses; carries the reason. */
export class CallNotAllowedError extends Error {
  constructor(readonly guard: Exclude<CallGuard, { ok: true }>) {
    super(guard.reason === "opted_out" ? "Contact opted out of calls." : "Couldn't check call consent.");
    this.name = "CallNotAllowedError";
  }
}

// ─── What the owner is told ───────────────────────────────────────────────────

/** A send server action's answer, for the UI to show. */
export type SendMessageResult =
  | { ok: true }
  | {
      ok: false;
      reason: "opted_out" | "consent_unavailable" | "invalid_address" | "not_configured" | "failed" | "no_organization";
      error: string;
    };

/**
 * Turn an outcome into the result a screen shows: the consent reason in full,
 * otherwise a translated sentence — never a provider's raw error.
 *
 * `inbox` is bound to the `inbox` namespace, `clients` to `clients`.
 */
export function toSendMessageResult(
  outcome: SendOutcome,
  channel: "sms" | "email",
  i18n: { inbox: Translate; clients: Translate; locale: string | null | undefined },
): SendMessageResult {
  if (outcome.ok) return { ok: true };
  switch (outcome.reason) {
    case "opted_out":
      return {
        ok: false,
        reason: "opted_out",
        error: describeDenial(outcome.decision, outcome.consent, i18n.clients, i18n.locale),
      };
    case "consent_unavailable":
      return { ok: false, reason: "consent_unavailable", error: i18n.inbox("errors.consentUnavailable") };
    case "invalid_address":
      return {
        ok: false,
        reason: "invalid_address",
        error: i18n.inbox("errors.invalidPhone", { phone: outcome.detail }),
      };
    case "not_configured":
      return {
        ok: false,
        reason: "not_configured",
        error: channel === "sms" ? i18n.inbox("errors.noSendingNumber") : i18n.inbox("errors.emailNotConfigured"),
      };
    case "provider":
      return {
        ok: false,
        reason: "failed",
        error: channel === "sms" ? i18n.inbox("errors.smsFailed") : i18n.inbox("errors.emailFailed"),
      };
  }
}

/** One line for a log or a queue row's `last_error` — not shown to the owner. */
export function outcomeForLog(outcome: SendFailure | Exclude<CallGuard, { ok: true }>): string {
  switch (outcome.reason) {
    case "opted_out":
      return `opted_out:${outcome.decision.channel}:${outcome.decision.source}:${outcome.decision.via}`;
    case "consent_unavailable":
      return "consent_unavailable";
    case "invalid_address":
      return `invalid_address:${outcome.detail}`;
    case "not_configured":
      return "not_configured";
    case "provider":
      return `provider:${outcome.code ?? "?"}:${outcome.detail}`.slice(0, 500);
  }
}
