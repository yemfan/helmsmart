import "server-only";

import { sendEmail } from "@/lib/email";
import { logEmailMessage } from "@/lib/ai-email/lead-resolution";
import { sendSMS } from "@/lib/twilioSms";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { OpenHouseRow, OpenHouseVisitorRow } from "./types";

/**
 * Post-event follow-up runner for open-house visitors.
 *
 * Runs hourly. Two queues:
 *   1. Thank-you email — due 2-24h after sign-in, never if marketing_consent=false
 *      or is_buyer_agented=true.
 *   2. Day-3 check-in SMS — due 72-96h after sign-in, same eligibility.
 *
 * Both queries use the partial indexes we created for this purpose so
 * table scans stay bounded as visitor volume grows.
 *
 * Fraud / spam protection: none at MVP. Abuse risk is limited because
 * all outbound is gated on marketing_consent=true, which only fires
 * when a visitor explicitly ticks a checkbox. Agented visitors never
 * receive outreach regardless.
 */

export type RunOpenHouseFollowupsResult = {
  thankYousSent: number;
  thankYouSkipped: number;
  thankYouFailed: number;
  checkInsSent: number;
  checkInSkipped: number;
  checkInFailed: number;
};

const THANK_YOU_MIN_HOURS = 2;
const THANK_YOU_MAX_HOURS = 26; // slight slack past the 24h intent
const CHECK_IN_MIN_HOURS = 72;
const CHECK_IN_MAX_HOURS = 96;

export async function runOpenHouseFollowups(opts?: {
  nowIso?: string;
  limit?: number;
}): Promise<RunOpenHouseFollowupsResult> {
  const nowMs = opts?.nowIso ? new Date(opts.nowIso).getTime() : Date.now();
  const limit = opts?.limit ?? 500;
  const result: RunOpenHouseFollowupsResult = {
    thankYousSent: 0,
    thankYouSkipped: 0,
    thankYouFailed: 0,
    checkInsSent: 0,
    checkInSkipped: 0,
    checkInFailed: 0,
  };

  await processQueue({
    kind: "thank_you",
    minHours: THANK_YOU_MIN_HOURS,
    maxHours: THANK_YOU_MAX_HOURS,
    nowMs,
    limit,
    result,
  });

  await processQueue({
    kind: "check_in",
    minHours: CHECK_IN_MIN_HOURS,
    maxHours: CHECK_IN_MAX_HOURS,
    nowMs,
    limit,
    result,
  });

  return result;
}

async function processQueue(ctx: {
  kind: "thank_you" | "check_in";
  minHours: number;
  maxHours: number;
  nowMs: number;
  limit: number;
  result: RunOpenHouseFollowupsResult;
}): Promise<void> {
  const { kind, minHours, maxHours, nowMs, limit, result } = ctx;
  const minIso = new Date(nowMs - maxHours * 3600 * 1000).toISOString();
  const maxIso = new Date(nowMs - minHours * 3600 * 1000).toISOString();
  const sentColumn = kind === "thank_you" ? "thank_you_sent_at" : "check_in_sent_at";

  // Candidate visitors: marketing_consent AND not buyer-agented AND
  // not yet sent this stage AND signed in within our time window.
  const { data: rows, error } = await supabaseAdmin
    .from("open_house_visitors")
    .select("*")
    .eq("marketing_consent", true)
    .eq("is_buyer_agented", false)
    .is(sentColumn, null)
    .gte("created_at", minIso)
    .lte("created_at", maxIso)
    .limit(limit);
  if (error) {
    console.error(`[open-houses.followups] ${kind} query error:`, error.message);
    return;
  }
  const visitors = (rows ?? []) as OpenHouseVisitorRow[];
  if (!visitors.length) return;

  // Batch fetch parent open houses (for property address + host name).
  const ohIds = [...new Set(visitors.map((v) => v.open_house_id))];
  const { data: ohRows } = await supabaseAdmin
    .from("open_houses")
    .select("id, agent_id, property_address, city, state, list_price")
    .in("id", ohIds);
  const ohById = new Map<string, Pick<OpenHouseRow, "id" | "agent_id" | "property_address" | "city" | "state" | "list_price">>();
  for (const r of (ohRows ?? []) as Array<Pick<OpenHouseRow, "id" | "agent_id" | "property_address" | "city" | "state" | "list_price">>) {
    ohById.set(r.id, r);
  }

  // Batch fetch agent first names.
  const agentIds = [...new Set(visitors.map((v) => v.agent_id))];
  const { data: agentRows } = await supabaseAdmin
    .from("agents")
    .select("id, first_name")
    .in("id", agentIds);
  const agentFirstNameById = new Map<string, string | null>();
  for (const a of (agentRows ?? []) as Array<{ id: string | number; first_name: string | null }>) {
    agentFirstNameById.set(String(a.id), a.first_name ?? null);
  }

  for (const v of visitors) {
    const oh = ohById.get(v.open_house_id);
    if (!oh) {
      result[kind === "thank_you" ? "thankYouSkipped" : "checkInSkipped"] += 1;
      continue;
    }
    const agentFirstName = agentFirstNameById.get(String(v.agent_id)) ?? null;
    try {
      if (kind === "thank_you") {
        if (!v.email) {
          result.thankYouSkipped += 1;
          await stampSent(v.id, sentColumn);
          continue;
        }
        const { subject, text, html } = renderThankYou({ visitor: v, openHouse: oh, agentFirstName });
        const sent = await sendEmail({ to: v.email, subject, text, html });

        // Thread into the Inbox only when this visitor is a contact.
        // `open_house_visitors.contact_id` is nullable — a walk-in who never
        // became a contact has none, and inventing one would attach the
        // message to somebody else's conversation.
        if (v.contact_id) {
          try {
            await logEmailMessage({
              leadId: String(v.contact_id),
              direction: "outbound",
              subject,
              body: text,
              agentId: v.agent_id ? String(v.agent_id) : null,
              externalMessageId: sent?.id ? String(sent.id) : null,
            });
          } catch (err) {
            console.warn("[open-houses] inbox log failed", {
              contactId: v.contact_id,
              error: err instanceof Error ? err.message : err,
            });
          }
        }
        await stampSent(v.id, sentColumn);
        result.thankYousSent += 1;
      } else {
        if (!v.phone) {
          result.checkInSkipped += 1;
          await stampSent(v.id, sentColumn);
          continue;
        }
        const message = renderCheckInSms({ visitor: v, openHouse: oh, agentFirstName });
        await sendSMS(v.phone, message);
        await stampSent(v.id, sentColumn);
        result.checkInsSent += 1;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      console.error(`[open-houses.followups] ${kind} visitor=${v.id}:`, message);
      result[kind === "thank_you" ? "thankYouFailed" : "checkInFailed"] += 1;
      // Don't stamp — retry next cron run.
    }
  }
}

async function stampSent(visitorId: string, column: string): Promise<void> {
  try {
    await supabaseAdmin
      .from("open_house_visitors")
      .update({ [column]: new Date().toISOString() })
      .eq("id", visitorId);
  } catch (err) {
    console.error(
      "[open-houses.followups] stamp failed:",
      err instanceof Error ? err.message : err,
    );
  }
}

// ── Email / SMS rendering ─────────────────────────────────────────────

function renderThankYou(input: {
  visitor: OpenHouseVisitorRow;
  openHouse: Pick<OpenHouseRow, "property_address" | "city" | "state" | "list_price">;
  agentFirstName: string | null;
}): { subject: string; text: string; html: string } {
  const { visitor, openHouse, agentFirstName } = input;
  const firstName = (visitor.name ?? "").split(/\s+/)[0] || "there";
  const propertyLine = openHouse.city
    ? `${openHouse.property_address}, ${openHouse.city}`
    : openHouse.property_address;
  const subject = `Thanks for visiting ${openHouse.property_address}`;
  const signoff = agentFirstName ? `— ${agentFirstName}` : "— Your LeadSmart agent";
  const text = [
    `Hi ${firstName},`,
    "",
    `Thanks so much for stopping by the open house at ${propertyLine} today.`,
    "",
    "A few quick thoughts in case they're useful:",
    "• Happy to put together a list of similar homes in your target neighborhoods.",
    "• If you'd like a second walkthrough, I can set that up any time this week.",
    "• Questions about financing? I work with several lenders who move fast.",
    "",
    "Either way, no pressure. Reply anytime with what's on your mind.",
    "",
    signoff,
  ].join("\n");
  const html = `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px;">
    <h1 style="font-size:18px;color:#0f172a;margin:0 0 12px 0;">Hi ${escapeHtml(firstName)},</h1>
    <p style="color:#334155;font-size:14px;line-height:1.6;">
      Thanks so much for stopping by the open house at <strong>${escapeHtml(propertyLine)}</strong> today.
    </p>
    <p style="color:#334155;font-size:14px;line-height:1.6;margin-top:12px;">A few quick thoughts in case they're useful:</p>
    <ul style="color:#334155;font-size:14px;line-height:1.7;margin:8px 0 16px 20px;padding:0;">
      <li>Happy to put together a list of similar homes in your target neighborhoods.</li>
      <li>If you'd like a second walkthrough, I can set that up any time this week.</li>
      <li>Questions about financing? I work with several lenders who move fast.</li>
    </ul>
    <p style="color:#334155;font-size:14px;line-height:1.6;">
      Either way, no pressure. Reply anytime with what's on your mind.
    </p>
    <p style="color:#334155;font-size:14px;line-height:1.6;margin-top:20px;">${escapeHtml(signoff)}</p>
  </div>
</body></html>`;
  return { subject, text, html };
}

function renderCheckInSms(input: {
  visitor: OpenHouseVisitorRow;
  openHouse: Pick<OpenHouseRow, "property_address">;
  agentFirstName: string | null;
}): string {
  const firstName = (input.visitor.name ?? "").split(/\s+/)[0] || "there";
  const signoff = input.agentFirstName ? `— ${input.agentFirstName}` : "";
  // Keep under 160 chars for single SMS segment where possible.
  return (
    `Hey ${firstName}, it's been a few days since you saw ${input.openHouse.property_address}. ` +
    `Any thoughts, or want to see more like it? ${signoff}`
  ).trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
