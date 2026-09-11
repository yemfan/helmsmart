// Outbound consent: may we contact this person on this channel, for this purpose?
//
// Pure — no I/O, tenancy or framework — so the decision is one function every
// send path shares, and each app loads the inputs from its own tables. Sits
// beside `shouldStopMessaging` because the two are halves of one rule: that
// function recognises an opt-out when it arrives; this one honours it on every
// send afterwards.

/** How we would reach the person. */
export type ConsentChannel = "sms" | "email" | "call";

/**
 * Why we are reaching them. The channel decides almost everything; purpose only
 * matters for email, where a receipt for something the person bought is not
 * the kind of mail an unsubscribe is about.
 *
 *   conversation   a person typed it (an inbox reply, a one-to-one email)
 *   automated      the product sent it on its own: Auto Pilot and other AI
 *                  replies, auto-replies, missed-call texts, reminders,
 *                  booking confirmations, AI calls, automation rules
 *   marketing      campaigns
 *   transactional  invoices, receipts, estimates, statements, payment links
 */
export type ConsentPurpose = "conversation" | "automated" | "marketing" | "transactional";

export const CONSENT_CHANNELS: readonly ConsentChannel[] = ["sms", "email", "call"];
export const CONSENT_PURPOSES: readonly ConsentPurpose[] = [
  "conversation",
  "automated",
  "marketing",
  "transactional",
];

/** Where an opt-out was recorded. */
export type ConsentSource = "client_preference" | "sms_unsubscribe" | "email_unsubscribe";

/**
 * How the person opted out, as far as the record says.
 *
 *   stop_reply    they texted STOP (or UNSUBSCRIBE, END, QUIT, CANCEL)
 *   carrier       the SMS provider refused a send because they had
 *   unsubscribed  an unsubscribe record with no more specific reason
 *   marked        someone on the team switched it on for them
 */
export type OptOutVia = "stop_reply" | "carrier" | "unsubscribed" | "marked";

/** Reason codes written to `*_unsubscribes.reason` by this module's callers. */
export const OPT_OUT_REASON = {
  stopReply: "stop_keyword",
  carrier: "carrier_21610",
} as const;

/** One row from an unsubscribe table, as much of it as the decision reads. */
export interface UnsubscribeRecord {
  unsubscribed_at?: string | null;
  reason?: string | null;
}

/** Everything the decision needs about one recipient. Absent means "no record". */
export interface ConsentInputs {
  /** The client's communication preferences row, if they have one. */
  preferences?: {
    opted_out_sms?: boolean | null;
    opted_out_email?: boolean | null;
    opted_out_calls?: boolean | null;
  } | null;
  /** A `sms_unsubscribes` row for the destination phone. */
  smsUnsubscribe?: UnsubscribeRecord | null;
  /** An `email_unsubscribes` row for the destination address. */
  emailUnsubscribe?: UnsubscribeRecord | null;
}

export type ConsentAllowed = {
  allowed: true;
  channel: ConsentChannel;
  purpose: ConsentPurpose;
};

export type ConsentDenied = {
  allowed: false;
  channel: ConsentChannel;
  purpose: ConsentPurpose;
  source: ConsentSource;
  via: OptOutVia;
  /** When the opt-out was recorded, if the record says. ISO string. */
  since: string | null;
};

export type ConsentDecision = ConsentAllowed | ConsentDenied;

/**
 * Does an opt-out on this channel cover this purpose?
 *
 * SMS: every text. A STOP is a legal instruction to the sending number, and the
 * carrier enforces it anyway (Twilio refuses with 21610), so there is nothing a
 * purpose could unlock.
 * Calls: every call the product places — AI outbound calls and reminder calls.
 * Email: everything except transactional mail about something the person
 * already bought or was billed for.
 */
export function optOutCovers(channel: ConsentChannel, purpose: ConsentPurpose): boolean {
  if (channel === "email") return purpose !== "transactional";
  return true;
}

function viaFromReason(reason: string | null | undefined): OptOutVia {
  if (reason === OPT_OUT_REASON.stopReply) return "stop_reply";
  if (reason === OPT_OUT_REASON.carrier) return "carrier";
  // Any other reason ("manual", "bounce", "complaint", a campaign link) is an
  // unsubscribe we have a date for but no more specific story about.
  return "unsubscribed";
}

/**
 * The one consent decision. Every outbound path — a person's reply, Auto Pilot,
 * auto-replies, missed-call texts, reminders, campaigns, automations, AI calls —
 * asks this before it sends.
 *
 * An unsubscribe record wins over the preference flag when both say "no",
 * because it carries a date and a reason the owner can be told.
 */
export function decideConsent(
  channel: ConsentChannel,
  purpose: ConsentPurpose,
  inputs: ConsentInputs,
): ConsentDecision {
  const allowed: ConsentAllowed = { allowed: true, channel, purpose };
  if (!optOutCovers(channel, purpose)) return allowed;

  const deny = (source: ConsentSource, via: OptOutVia, since: string | null): ConsentDenied => ({
    allowed: false,
    channel,
    purpose,
    source,
    via,
    since,
  });

  const prefs = inputs.preferences ?? null;

  if (channel === "sms") {
    const unsub = inputs.smsUnsubscribe;
    if (unsub) return deny("sms_unsubscribe", viaFromReason(unsub.reason), unsub.unsubscribed_at ?? null);
    if (prefs?.opted_out_sms) return deny("client_preference", "marked", null);
    return allowed;
  }

  if (channel === "email") {
    const unsub = inputs.emailUnsubscribe;
    if (unsub) return deny("email_unsubscribe", viaFromReason(unsub.reason), unsub.unsubscribed_at ?? null);
    if (prefs?.opted_out_email) return deny("client_preference", "marked", null);
    return allowed;
  }

  if (prefs?.opted_out_calls) return deny("client_preference", "marked", null);
  return allowed;
}

/**
 * SMS opt-in — the keywords that undo a STOP. Exact match, like
 * `shouldStopMessaging`. "YES" is deliberately not one: customers text YES to
 * confirm appointments, and reading that as consent to resume texting would
 * clear an opt-out the person never withdrew.
 */
export function shouldStartMessaging(body: string): boolean {
  return /^(start|unstop)$/i.test(body.trim());
}
