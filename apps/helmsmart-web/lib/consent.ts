/**
 * The app side of outbound consent: load what a client agreed to, record it
 * when it changes, and say why a send was refused.
 *
 * The decision itself is `decideConsent` in `@helm/dna-communication` — pure,
 * shared, and the only place the policy lives. This module fetches its inputs
 * from the three places an opt-out can be recorded here:
 *
 *   communication_preferences.opted_out_{sms,email,calls}   the client page's switches
 *   sms_unsubscribes   (phone)                             a STOP reply, a carrier refusal
 *   email_unsubscribes (email)                             a campaign unsubscribe
 *
 * Before this existed, only the client page and its save action read those
 * flags. Every send path — inbox replies, Auto Pilot, auto-replies, missed-call
 * texts, reminders, campaigns, automations, AI calls — sent regardless, and a
 * STOP reply was never written down anywhere.
 *
 * A plain module (no "use server") that takes its Supabase client as an
 * argument, so a server action passes its RLS client and a webhook or cron
 * passes the service client it already holds.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { intlLocale } from "@leadsmart/i18n";
import {
  decideConsent,
  type ConsentChannel,
  type ConsentDecision,
  type ConsentDenied,
  type ConsentInputs,
  type ConsentPurpose,
  type UnsubscribeRecord,
} from "@helm/dna-communication";
import { normalizePhoneE164, phoneLast10 } from "@/lib/phone";

type Db = SupabaseClient;
export type Translate = (key: string, opts?: Record<string, unknown>) => string;

export interface ConsentClient {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
}

/** Who a send is addressed to. Any subset; the loader fills in the rest. */
export interface ConsentTarget {
  clientId?: string | null;
  phone?: string | null;
  email?: string | null;
}

/** Everything known about one recipient's consent. */
export interface LoadedConsent {
  client: ConsentClient | null;
  phone: string | null;
  email: string | null;
  inputs: ConsentInputs;
}

/**
 * The consent tables could not be read. Callers treat this as "do not send":
 * an opt-out we failed to look up is still an opt-out.
 */
export class ConsentLookupError extends Error {
  constructor(what: string, cause: unknown) {
    super(`Couldn't read ${what} to check consent.`);
    this.name = "ConsentLookupError";
    this.cause = cause;
  }
}

const CLIENT_COLUMNS = "id, first_name, last_name, phone, email";

/**
 * The shapes one phone number is stored in across a tenant's data — E.164 from
 * caller ID, "(626) 755-7917" typed by hand, "626-755-7917" from an import — so
 * an exact-match lookup finds the client and the unsubscribe however it was
 * written.
 */
export function phoneVariants(raw: string | null | undefined): string[] {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return [];
  const out = new Set<string>([trimmed]);
  const e164 = normalizePhoneE164(trimmed);
  if (e164.ok) out.add(e164.value);
  const ten = phoneLast10(trimmed);
  if (ten) {
    const [a, b, c] = [ten.slice(0, 3), ten.slice(3, 6), ten.slice(6)];
    out.add(ten);
    out.add(`1${ten}`);
    out.add(`+1${ten}`);
    out.add(`(${a}) ${b}-${c}`);
    out.add(`${a}-${b}-${c}`);
    out.add(`${a}.${b}.${c}`);
    out.add(`${a} ${b} ${c}`);
  }
  return [...out];
}

/** The key an unsubscribe is matched on in bulk: last ten digits, else the raw value. */
export function phoneKey(raw: string | null | undefined): string {
  return phoneLast10(raw) || (raw ?? "").trim();
}

function emailVariants(raw: string | null | undefined): string[] {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return [];
  return [...new Set([trimmed, trimmed.toLowerCase()])];
}

/**
 * Load one recipient's consent inputs.
 *
 * With a client id, that client's switches count. Without one — an inbox thread
 * from a number nobody has added as a client yet — the address is looked up in
 * case it does belong to a client, and the unsubscribe tables are checked by
 * address either way.
 *
 * Throws `ConsentLookupError` when a table cannot be read.
 */
export async function loadConsent(db: Db, orgId: string, target: ConsentTarget): Promise<LoadedConsent> {
  let client: ConsentClient | null = null;

  if (target.clientId) {
    const { data, error } = await db
      .from("clients")
      .select(CLIENT_COLUMNS)
      .eq("organization_id", orgId)
      .eq("id", target.clientId)
      .maybeSingle();
    if (error) throw new ConsentLookupError("the client", error);
    client = (data as ConsentClient | null) ?? null;
  } else if (target.phone || target.email) {
    const byPhone = target.phone ? phoneVariants(target.phone) : [];
    const query = db.from("clients").select(CLIENT_COLUMNS).eq("organization_id", orgId);
    const { data, error } = await (byPhone.length
      ? query.in("phone", byPhone)
      : query.in("email", emailVariants(target.email))
    ).limit(1);
    if (error) throw new ConsentLookupError("the client", error);
    client = ((data as ConsentClient[] | null) ?? [])[0] ?? null;
  }

  const phone = target.phone?.trim() || client?.phone?.trim() || null;
  const email = target.email?.trim() || client?.email?.trim() || null;
  const phones = phoneVariants(phone);
  const emails = emailVariants(email);

  const [prefs, smsUnsub, emailUnsub] = await Promise.all([
    client
      ? db
          .from("communication_preferences")
          .select("opted_out_sms, opted_out_email, opted_out_calls")
          .eq("organization_id", orgId)
          .eq("client_id", client.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    phones.length
      ? db
          .from("sms_unsubscribes")
          .select("unsubscribed_at, reason")
          .eq("organization_id", orgId)
          .in("phone_number", phones)
          .order("unsubscribed_at", { ascending: true })
          .limit(1)
      : Promise.resolve({ data: [], error: null }),
    emails.length
      ? db
          .from("email_unsubscribes")
          .select("unsubscribed_at, reason")
          .eq("organization_id", orgId)
          .in("email", emails)
          .order("unsubscribed_at", { ascending: true })
          .limit(1)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (prefs.error) throw new ConsentLookupError("communication preferences", prefs.error);
  if (smsUnsub.error) throw new ConsentLookupError("SMS unsubscribes", smsUnsub.error);
  if (emailUnsub.error) throw new ConsentLookupError("email unsubscribes", emailUnsub.error);

  return {
    client,
    phone,
    email,
    inputs: {
      preferences: (prefs.data as ConsentInputs["preferences"]) ?? null,
      smsUnsubscribe: ((smsUnsub.data as UnsubscribeRecord[] | null) ?? [])[0] ?? null,
      emailUnsubscribe: ((emailUnsub.data as UnsubscribeRecord[] | null) ?? [])[0] ?? null,
    },
  };
}

/** Load and decide in one call. Throws `ConsentLookupError` like `loadConsent`. */
export async function checkConsent(
  db: Db,
  orgId: string,
  target: ConsentTarget,
  channel: ConsentChannel,
  purpose: ConsentPurpose,
): Promise<{ decision: ConsentDecision; consent: LoadedConsent }> {
  const consent = await loadConsent(db, orgId, target);
  return { decision: decideConsent(channel, purpose, consent.inputs), consent };
}

// ─── Bulk (campaigns, "Call all") ─────────────────────────────────────────────

/** Every opt-out in an organization, for deciding a whole recipient list at once. */
export interface OrgOptOuts {
  prefsByClient: Map<string, NonNullable<ConsentInputs["preferences"]>>;
  smsByPhone: Map<string, UnsubscribeRecord>;
  emailByAddress: Map<string, UnsubscribeRecord>;
}

export async function loadOrgOptOuts(db: Db, orgId: string): Promise<OrgOptOuts> {
  const [prefs, sms, email] = await Promise.all([
    db
      .from("communication_preferences")
      .select("client_id, opted_out_sms, opted_out_email, opted_out_calls")
      .eq("organization_id", orgId),
    db.from("sms_unsubscribes").select("phone_number, unsubscribed_at, reason").eq("organization_id", orgId),
    db.from("email_unsubscribes").select("email, unsubscribed_at, reason").eq("organization_id", orgId),
  ]);
  if (prefs.error) throw new ConsentLookupError("communication preferences", prefs.error);
  if (sms.error) throw new ConsentLookupError("SMS unsubscribes", sms.error);
  if (email.error) throw new ConsentLookupError("email unsubscribes", email.error);

  const prefsByClient = new Map<string, NonNullable<ConsentInputs["preferences"]>>();
  for (const row of (prefs.data ?? []) as Array<{ client_id: string } & NonNullable<ConsentInputs["preferences"]>>) {
    if (row.opted_out_sms || row.opted_out_email || row.opted_out_calls) prefsByClient.set(row.client_id, row);
  }
  const smsByPhone = new Map<string, UnsubscribeRecord>();
  for (const row of (sms.data ?? []) as Array<{ phone_number: string } & UnsubscribeRecord>) {
    const key = phoneKey(row.phone_number);
    if (key && !smsByPhone.has(key)) smsByPhone.set(key, row);
  }
  const emailByAddress = new Map<string, UnsubscribeRecord>();
  for (const row of (email.data ?? []) as Array<{ email: string } & UnsubscribeRecord>) {
    const key = (row.email ?? "").trim().toLowerCase();
    if (key && !emailByAddress.has(key)) emailByAddress.set(key, row);
  }
  return { prefsByClient, smsByPhone, emailByAddress };
}

/** The consent inputs for one recipient of a bulk send. */
export function inputsFor(
  optOuts: OrgOptOuts,
  recipient: { clientId?: string | null; phone?: string | null; email?: string | null },
): ConsentInputs {
  const phone = recipient.phone ? phoneKey(recipient.phone) : "";
  const email = (recipient.email ?? "").trim().toLowerCase();
  return {
    preferences: recipient.clientId ? (optOuts.prefsByClient.get(recipient.clientId) ?? null) : null,
    smsUnsubscribe: phone ? (optOuts.smsByPhone.get(phone) ?? null) : null,
    emailUnsubscribe: email ? (optOuts.emailByAddress.get(email) ?? null) : null,
  };
}

// ─── Recording opt-outs ───────────────────────────────────────────────────────

async function clientIdsForPhone(db: Db, orgId: string, phone: string): Promise<string[]> {
  const { data, error } = await db
    .from("clients")
    .select("id")
    .eq("organization_id", orgId)
    .in("phone", phoneVariants(phone));
  if (error) {
    console.error("[consent] client lookup by phone failed:", error);
    return [];
  }
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
}

/**
 * Write down that a phone number opted out of texts: in `sms_unsubscribes` (by
 * number, so it holds even for someone who is not a client yet) and on every
 * client with that number, so their page shows the switch on.
 *
 * Keeps the FIRST date when the number is already unsubscribed — a second STOP
 * does not make the opt-out newer.
 */
export async function recordSmsOptOut(
  db: Db,
  orgId: string,
  phone: string,
  reason: string,
): Promise<{ clientIds: string[] }> {
  const normalized = normalizePhoneE164(phone);
  const number = normalized.ok ? normalized.value : phone.trim();
  const now = new Date().toISOString();

  const { error: unsubError } = await db
    .from("sms_unsubscribes")
    .upsert(
      { organization_id: orgId, phone_number: number, reason, unsubscribed_at: now },
      { onConflict: "organization_id,phone_number", ignoreDuplicates: true },
    );
  if (unsubError) console.error("[consent] recording SMS unsubscribe failed:", unsubError);

  const clientIds = await clientIdsForPhone(db, orgId, phone);
  for (const clientId of clientIds) {
    const { error } = await db
      .from("communication_preferences")
      .upsert(
        { organization_id: orgId, client_id: clientId, opted_out_sms: true, updated_at: now },
        { onConflict: "organization_id,client_id" },
      );
    if (error) console.error("[consent] recording SMS opt-out on client failed:", { clientId, error });
  }
  return { clientIds };
}

/**
 * Undo a text opt-out for a number: the person texted START, or the team
 * switched it off on the client page. Clears the unsubscribe row(s) and the
 * switch on every client with that number.
 */
export async function clearSmsOptOut(db: Db, orgId: string, phone: string): Promise<{ clientIds: string[] }> {
  const { error: unsubError } = await db
    .from("sms_unsubscribes")
    .delete()
    .eq("organization_id", orgId)
    .in("phone_number", phoneVariants(phone));
  if (unsubError) console.error("[consent] clearing SMS unsubscribe failed:", unsubError);

  const clientIds = await clientIdsForPhone(db, orgId, phone);
  if (clientIds.length) {
    const { error } = await db
      .from("communication_preferences")
      .update({ opted_out_sms: false, updated_at: new Date().toISOString() })
      .eq("organization_id", orgId)
      .in("client_id", clientIds);
    if (error) console.error("[consent] clearing SMS opt-out on clients failed:", error);
  }
  return { clientIds };
}

/** Clear an email unsubscribe for an address (the team switched the opt-out off). */
export async function clearEmailOptOut(db: Db, orgId: string, email: string): Promise<void> {
  const { error } = await db
    .from("email_unsubscribes")
    .delete()
    .eq("organization_id", orgId)
    .in("email", emailVariants(email));
  if (error) console.error("[consent] clearing email unsubscribe failed:", error);
}

// ─── Saying why ───────────────────────────────────────────────────────────────

function shortDate(iso: string, locale: string | null | undefined): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(intlLocale(locale ?? "en"), { month: "short", day: "numeric" });
}

function fullName(client: ConsentClient | null): string {
  return [client?.first_name, client?.last_name].filter(Boolean).join(" ").trim();
}

/**
 * The reason a send was refused, in the words the owner reads — e.g.
 * "Priya Patel opted out of text messages on Sep 3 (replied STOP). You can
 * still email Priya."
 *
 * `t` is bound to the `clients` namespace by the caller (`getServerT("clients")`
 * in a request, `translatorFor(locale, "clients")` elsewhere).
 */
export function describeDenial(
  decision: ConsentDenied,
  consent: LoadedConsent | null,
  t: Translate,
  locale: string | null | undefined,
): string {
  const client = consent?.client ?? null;
  const name = fullName(client) || t("consent.someone");
  const date = decision.since ? shortDate(decision.since, locale) : null;

  let reason: string;
  if (decision.channel === "sms") {
    if (date && decision.via === "stop_reply") reason = t("consent.denied.sms.stopReply", { name, date });
    else if (date && decision.via === "carrier") reason = t("consent.denied.sms.carrier", { name, date });
    else if (date) reason = t("consent.denied.sms.unsubscribed", { name, date });
    else reason = t("consent.denied.sms.marked", { name });
  } else if (decision.channel === "email") {
    reason = date ? t("consent.denied.email.unsubscribed", { name, date }) : t("consent.denied.email.marked", { name });
  } else {
    reason = t("consent.denied.call.marked", { name });
  }

  const alternative = consent && client ? alternativeFor(decision.channel, consent, t) : null;
  return alternative ? t("consent.withAlternative", { reason, alternative }) : reason;
}

/** "You can still email Priya." — only channels that are open AND have an address. */
function alternativeFor(refused: ConsentChannel, consent: LoadedConsent, t: Translate): string | null {
  const name = consent.client?.first_name?.trim() || fullName(consent.client);
  if (!name) return null;
  const canText =
    refused !== "sms" && !!consent.phone && decideConsent("sms", "conversation", consent.inputs).allowed;
  const canEmail =
    refused !== "email" && !!consent.email && decideConsent("email", "conversation", consent.inputs).allowed;
  if (canText && canEmail) return t("consent.alternative.textOrEmail", { name });
  if (canText) return t("consent.alternative.text", { name });
  if (canEmail) return t("consent.alternative.email", { name });
  return null;
}

/**
 * Per-channel opt-out state for the client page: whether the switch should
 * show as on (any source says no), and how and when it happened.
 */
export type ChannelOptOut = { optedOut: boolean; via: ConsentDenied["via"] | null; since: string | null };

export function optOutState(inputs: ConsentInputs): Record<ConsentChannel, ChannelOptOut> {
  const state = (channel: ConsentChannel): ChannelOptOut => {
    const d = decideConsent(channel, "conversation", inputs);
    return d.allowed ? { optedOut: false, via: null, since: null } : { optedOut: true, via: d.via, since: d.since };
  };
  return { sms: state("sms"), email: state("email"), call: state("call") };
}

// ─── Calls ────────────────────────────────────────────────────────────────────

/** The consent guard's answer for a call. `guardCall` in lib/outbound-send.ts produces it. */
export type CallGuard =
  | { ok: true }
  | { ok: false; reason: "opted_out"; decision: ConsentDenied; consent: LoadedConsent }
  | { ok: false; reason: "consent_unavailable" };

/**
 * Thrown by `placeOutboundCall` when the guard refuses; carries the reason.
 *
 * Lives here rather than beside `guardCall` so the call actions can recognise a
 * refusal without importing the send path. That module pulls in Twilio and the
 * `server-only` email helper, and importing it from `lib/actions/outbound.ts`
 * made every importer of those actions — and every test of them — load the
 * whole outbound stack.
 */
export class CallNotAllowedError extends Error {
  constructor(readonly guard: Exclude<CallGuard, { ok: true }>) {
    super(guard.reason === "opted_out" ? "Contact opted out of calls." : "Couldn't check call consent.");
    this.name = "CallNotAllowedError";
  }
}
