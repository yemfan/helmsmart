import "server-only";

import { sendEmail } from "@/lib/email";
import { sendSMS } from "@/lib/twilioSms";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { signOfferExtendToken } from "./extendToken";
import { renderAlertEmail, renderAlertSms, type AlertInput } from "./renderAlert";

const DEFAULT_EXTEND_HOURS = 24;

/**
 * Finds offers near expiration and fires a warning (24h out) or final
 * (2h out) alert. Runs every 2 hours.
 *
 * Each level sends at most once per day per offer — the unique index
 * on (offer_kind, offer_id, alert_level, alert_date) guarantees it.
 * Retries or overlapping runs can't double-send.
 *
 * Covers both buyer-side `offers` and listing-side `listing_offers`.
 * Eligibility:
 *   - offer_expires_at is set
 *   - status is in the active set (draft/submitted/countered)
 *   - expiration is inside the target window for this level
 *
 * Channel selection:
 *   - WARNING: email only — 24h out is plenty of time.
 *   - FINAL: email + SMS — 2h out needs the agent's eyeballs NOW.
 */

const WARNING_MIN_HOURS = 20;
const WARNING_MAX_HOURS = 28;
const FINAL_MIN_HOURS = 0.5;
const FINAL_MAX_HOURS = 4;

export type RunExpirationAlertsResult = {
  processed: number;
  sentEmails: number;
  sentSms: number;
  skippedAlreadySent: number;
  skippedNoContact: number;
  failed: number;
};

export async function runOfferExpirationAlerts(opts?: {
  nowIso?: string;
  appBaseUrl?: string;
}): Promise<RunExpirationAlertsResult> {
  const nowIso = opts?.nowIso ?? new Date().toISOString();
  const appBaseUrl =
    opts?.appBaseUrl ??
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "https://www.realtybossai.com";
  const result: RunExpirationAlertsResult = {
    processed: 0,
    sentEmails: 0,
    sentSms: 0,
    skippedAlreadySent: 0,
    skippedNoContact: 0,
    failed: 0,
  };

  for (const level of ["warning", "final"] as const) {
    const minH = level === "warning" ? WARNING_MIN_HOURS : FINAL_MIN_HOURS;
    const maxH = level === "warning" ? WARNING_MAX_HOURS : FINAL_MAX_HOURS;
    const nowMs = new Date(nowIso).getTime();
    const earliestExpiry = new Date(nowMs + minH * 3600 * 1000).toISOString();
    const latestExpiry = new Date(nowMs + maxH * 3600 * 1000).toISOString();
    const alertDate = nowIso.slice(0, 10);

    // Buyer-side offers
    await processKind({
      kind: "buyer",
      alertLevel: level,
      nowIso,
      alertDate,
      earliestExpiry,
      latestExpiry,
      appBaseUrl,
      result,
    });

    // Listing-side offers
    await processKind({
      kind: "listing",
      alertLevel: level,
      nowIso,
      alertDate,
      earliestExpiry,
      latestExpiry,
      appBaseUrl,
      result,
    });
  }

  return result;
}

async function processKind(ctx: {
  kind: "buyer" | "listing";
  alertLevel: "warning" | "final";
  nowIso: string;
  alertDate: string;
  earliestExpiry: string;
  latestExpiry: string;
  appBaseUrl: string;
  result: RunExpirationAlertsResult;
}): Promise<void> {
  const { kind, alertLevel, nowIso, alertDate, earliestExpiry, latestExpiry, appBaseUrl, result } = ctx;

  const table = kind === "buyer" ? "offers" : "listing_offers";
  const contactJoinCol = kind === "buyer" ? "contact_id" : null; // buyer-side has contact_id

  // Status filter — active offers only.
  const activeStatuses = ["draft", "submitted", "countered"];

  type OfferRow = {
    id: string;
    agent_id: string;
    offer_price: number;
    current_price: number | null;
    property_address: string;
    offer_expires_at: string | null;
    status: string;
    contact_id?: string | null;
    buyer_name?: string | null;
  };

  const selectCols =
    kind === "buyer"
      ? "id, agent_id, offer_price, current_price, property_address, offer_expires_at, status, contact_id"
      : "id, agent_id, offer_price, current_price, property_address, offer_expires_at, status, buyer_name";

  const { data: offers } = await supabaseAdmin
    .from(table)
    .select(selectCols)
    .in("status", activeStatuses)
    .not("offer_expires_at", "is", null)
    .gte("offer_expires_at", earliestExpiry)
    .lte("offer_expires_at", latestExpiry);

  const candidates = (offers ?? []) as OfferRow[];
  if (!candidates.length) return;

  // Prefetch contact names for buyer-side offers (listing-side stores buyer_name inline).
  const contactIds =
    kind === "buyer"
      ? [...new Set(candidates.map((o) => o.contact_id).filter((x): x is string => Boolean(x)))]
      : [];
  const contactNameById = new Map<string, string | null>();
  if (contactIds.length) {
    const { data: contactRows } = await supabaseAdmin
      .from("contacts")
      .select("id, first_name, last_name, name, email")
      .in("id", contactIds);
    for (const c of (contactRows ?? []) as Array<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      name: string | null;
      email: string | null;
    }>) {
      const n = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.name || c.email || null;
      contactNameById.set(c.id, n);
    }
  }

  for (const offer of candidates) {
    result.processed += 1;
    try {
      // Dedupe via INSERT-first.
      const { data: logRow, error: logErr } = await supabaseAdmin
        .from("offer_expiration_alert_log")
        .insert({
          agent_id: offer.agent_id,
          offer_kind: kind,
          offer_id: offer.id,
          alert_level: alertLevel,
          alert_date: alertDate,
        })
        .select("id")
        .maybeSingle();
      if (logErr) {
        const code = (logErr as { code?: string }).code;
        if (code === "23505") {
          result.skippedAlreadySent += 1;
          continue;
        }
        throw logErr;
      }
      const logId = (logRow as { id: string } | null)?.id ?? null;

      // Resolve agent email + phone.
      const agent = await resolveAgent(String(offer.agent_id));
      if (!agent || !agent.email) {
        result.skippedNoContact += 1;
        if (logId) await stampLog(logId, { error: "no agent email" });
        continue;
      }

      const hoursUntil =
        (new Date(offer.offer_expires_at!).getTime() - new Date(nowIso).getTime()) /
        3600000;
      const counterpartyLabel =
        kind === "buyer"
          ? contactNameById.get(offer.contact_id ?? "") ?? null
          : offer.buyer_name ?? null;
      const offerUrl =
        kind === "buyer"
          ? `/dashboard/offers/${offer.id}`
          : `/dashboard/listing-offers/${offer.id}`;

      // Sign a one-click extend token if the feature is enabled. The
      // token pins prev_expires_at so any later state change (extend,
      // accept, reject) invalidates it — anti-replay without a
      // "consumed tokens" table.
      const extendToken = signOfferExtendToken({
        kind,
        offerId: offer.id,
        agentId: String(offer.agent_id),
        prevExpiresAt: offer.offer_expires_at!,
        extendHours: DEFAULT_EXTEND_HOURS,
        issuedAt: nowIso,
      });
      const extendUrl = extendToken
        ? `${appBaseUrl}/offer-extend/${extendToken}`
        : null;

      const alertInput: AlertInput = {
        offerKind: kind,
        alertLevel,
        propertyAddress: offer.property_address,
        counterpartyLabel,
        offerPrice: offer.current_price ?? offer.offer_price,
        expiresAtIso: offer.offer_expires_at!,
        hoursUntilExpiration: hoursUntil,
        appBaseUrl,
        offerUrl,
        extendUrl,
        extendHours: DEFAULT_EXTEND_HOURS,
      };

      // Email always.
      const { subject, html, text } = renderAlertEmail(alertInput);
      await sendEmail({ to: agent.email, subject, text, html });
      result.sentEmails += 1;

      // SMS only for final alert.
      let smsSent = false;
      if (alertLevel === "final" && agent.phone) {
        try {
          await sendSMS(agent.phone, renderAlertSms(alertInput));
          smsSent = true;
          result.sentSms += 1;
        } catch (smsErr) {
          console.warn(
            "[offer-expirations] SMS failed (email still sent):",
            smsErr instanceof Error ? smsErr.message : smsErr,
          );
        }
      }

      if (logId) {
        await stampLog(logId, { email_sent: true, sms_sent: smsSent });
      }
    } catch (err) {
      result.failed += 1;
      const message = err instanceof Error ? err.message : "unknown";
      console.error(
        `[offer-expirations] ${kind} offer=${offer.id}:`,
        message,
      );
      await stampLog(
        null,
        { error: message.slice(0, 500) },
        { offerKind: kind, offerId: offer.id, alertLevel, alertDate },
      );
    }
  }

  void contactJoinCol; // keep the column-name hint in source for future ref
}

async function stampLog(
  logId: string | null,
  patch: { email_sent?: boolean; sms_sent?: boolean; error?: string },
  fallback?: {
    offerKind: "buyer" | "listing";
    offerId: string;
    alertLevel: "warning" | "final";
    alertDate: string;
  },
): Promise<void> {
  try {
    if (logId) {
      await supabaseAdmin.from("offer_expiration_alert_log").update(patch).eq("id", logId);
    } else if (fallback) {
      await supabaseAdmin
        .from("offer_expiration_alert_log")
        .update(patch)
        .eq("offer_kind", fallback.offerKind)
        .eq("offer_id", fallback.offerId)
        .eq("alert_level", fallback.alertLevel)
        .eq("alert_date", fallback.alertDate);
    }
  } catch {
    // best-effort
  }
}

async function resolveAgent(
  agentId: string,
): Promise<{ email: string | null; phone: string | null } | null> {
  const { data: agentRow } = await supabaseAdmin
    .from("agents")
    .select("auth_user_id")
    .eq("id", agentId)
    .maybeSingle();
  const authUserId = (agentRow as { auth_user_id: string | null } | null)?.auth_user_id ?? null;
  if (!authUserId) return null;

  let email: string | null = null;
  try {
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(authUserId);
    email = authUser?.user?.email ?? null;
  } catch {
    email = null;
  }

  let phone: string | null = null;
  try {
    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("phone")
      .eq("user_id", authUserId)
      .maybeSingle();
    const raw = ((profile as { phone: string | null } | null)?.phone ?? "").trim();
    if (raw) {
      if (raw.startsWith("+")) phone = raw;
      else {
        const digits = raw.replace(/\D/g, "");
        if (digits.length === 10) phone = `+1${digits}`;
        else if (digits.length === 11 && digits.startsWith("1")) phone = `+${digits}`;
      }
    }
  } catch {
    phone = null;
  }

  return { email, phone };
}
