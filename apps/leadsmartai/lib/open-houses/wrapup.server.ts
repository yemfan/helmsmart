import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { getSiteUrl } from "@/lib/siteUrl";
import { loadAgentDisplayIdentities } from "@/lib/agents/displayIdentity.server";
import type { OpenHouseRow, OpenHouseVisitorRow } from "./types";
import { buildWrapupSummary, renderWrapupEmail, wrapupDue, wrapupRecipients, type WrapupAudience, type WrapupSummary } from "./wrapup";

/**
 * The wrap-up: prepared by the cron when an open house ends (summary
 * built and stored, owner prefilled from the listing's seller, host told
 * it is ready), and sent by the host from the open-house page after they
 * add a comment (summary rebuilt from the sheet as it stands, one email
 * per recipient, a copy to the host, everything recorded on the row).
 */

const PREPARE_WINDOW_HOURS = 72;

type HostIdentity = { name: string | null; email: string | null; phone: string | null; brokerage: string | null; timezone: string | null };

async function hostOf(agentId: string): Promise<HostIdentity> {
  const [ident, agent] = await Promise.all([
    loadAgentDisplayIdentities([agentId]).catch(() => new Map()),
    supabaseAdmin.from("agents").select("timezone, auth_user_id").eq("id", agentId as never).maybeSingle(),
  ]);
  const i = ident.get(String(agentId)) as { fullName?: string | null; firstName?: string | null; email?: string | null; phone?: string | null; brokerage?: string | null } | undefined;
  const row = agent.data as { timezone?: string | null; auth_user_id?: string | null } | null;
  let email = i?.email ?? null;
  if (!email && row?.auth_user_id) {
    const { data: prof } = await supabaseAdmin.from("user_profiles").select("email, full_name").eq("user_id", row.auth_user_id).maybeSingle();
    email = (prof as { email?: string | null } | null)?.email ?? null;
  }
  return { name: i?.fullName ?? i?.firstName ?? null, email, phone: i?.phone ?? null, brokerage: i?.brokerage ?? null, timezone: row?.timezone ?? null };
}

async function visitorsOf(openHouseId: string): Promise<OpenHouseVisitorRow[]> {
  const { data } = await supabaseAdmin.from("open_house_visitors").select("*").eq("open_house_id", openHouseId).order("created_at", { ascending: true }).limit(2000);
  return (data as OpenHouseVisitorRow[] | null) ?? [];
}

/** The seller on the linked listing, when the host did not name an owner. */
async function ownerFromListing(listingId: string | null): Promise<{ name: string | null; email: string | null } | null> {
  if (!listingId) return null;
  const { data: listing } = await supabaseAdmin.from("listings").select("contact_id").eq("id", listingId).maybeSingle();
  const contactId = (listing as { contact_id?: string | null } | null)?.contact_id;
  if (!contactId) return null;
  const { data: c } = await supabaseAdmin.from("contacts").select("name, email").eq("id", contactId).maybeSingle();
  const row = c as { name?: string | null; email?: string | null } | null;
  return row ? { name: row.name?.trim() || null, email: row.email?.trim() || null } : null;
}

export type PrepareResult = { prepared: number; nudged: number; failed: number };

/** Every open house that ended in the last three days and has no summary yet. */
export async function prepareDueWrapups(opts?: { nowIso?: string; limit?: number }): Promise<PrepareResult> {
  const nowMs = opts?.nowIso ? Date.parse(opts.nowIso) : Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const sinceIso = new Date(nowMs - PREPARE_WINDOW_HOURS * 3600 * 1000).toISOString();
  const result: PrepareResult = { prepared: 0, nudged: 0, failed: 0 };
  const { data, error } = await supabaseAdmin
    .from("open_houses")
    .select("*")
    .is("summary_ready_at", null)
    .neq("status", "cancelled")
    .gte("end_at", sinceIso)
    .lte("end_at", nowIso)
    .order("end_at", { ascending: true })
    .limit(opts?.limit ?? 200);
  if (error) {
    console.error("[open-houses.wrapup] query:", error.message);
    return result;
  }
  const origin = getSiteUrl().replace(/\/$/, "");
  for (const row of (data as OpenHouseRow[] | null) ?? []) {
    if (!wrapupDue(row, nowMs)) continue;
    try {
      const [visitors, owner] = await Promise.all([visitorsOf(row.id), row.owner_email ? Promise.resolve(null) : ownerFromListing(row.listing_id ?? null)]);
      const summary = buildWrapupSummary(visitors, new Date(nowMs));
      const patch: Record<string, unknown> = { summary, summary_ready_at: nowIso, status: row.status === "scheduled" || row.status === "in_progress" ? "completed" : row.status, updated_at: nowIso };
      if (owner && !row.owner_email) {
        patch.owner_name = row.owner_name ?? owner.name;
        patch.owner_email = owner.email;
      }
      const { error: upErr } = await supabaseAdmin.from("open_houses").update(patch as never).eq("id", row.id);
      if (upErr) throw new Error(upErr.message);
      result.prepared += 1;
      const host = await hostOf(String(row.agent_id));
      if (host.email) {
        const url = `${origin}/dashboard/open-houses/${row.id}#wrapup`;
        const where = [row.property_address, row.city].filter(Boolean).join(", ");
        const line = summary.total === 0 ? "No one signed in." : `${summary.total} signed in, ${summary.hot} buying within six months.`;
        await sendEmail({
          to: host.email,
          subject: `Your open house wrap-up is ready: ${where}`,
          text: [`Hi ${host.name?.split(/\s+/)[0] ?? "there"},`, "", `The open house at ${where} has ended. ${line}`, "", "The wrap-up is drafted. Add a comment and send it to the owner and the requesting agent:", url].join("\n"),
          html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#0f172a"><p>Hi ${host.name?.split(/\s+/)[0] ?? "there"},</p><p>The open house at <strong>${where}</strong> has ended. ${line}</p><p>The wrap-up is drafted. Add a comment and send it to the owner and the requesting agent.</p><p style="margin:24px 0"><a href="${url}" style="background:#0072ce;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block">Open the wrap-up</a></p></div>`,
        });
        result.nudged += 1;
      }
    } catch (e) {
      result.failed += 1;
      console.warn("[open-houses.wrapup] prepare failed:", row.id, e instanceof Error ? e.message : e);
    }
  }
  return result;
}

export type SendWrapupResult = { ok: true; sentTo: string[]; summary: WrapupSummary; openHouse: OpenHouseRow } | { ok: false; error: "not_found" | "no_recipients" | "send_failed" };

/** The host sends the report. Fresh summary, one email per recipient, a copy to the host, recorded. */
export async function sendWrapup(args: { agentId: string; openHouseId: string; comment: string | null; to: WrapupAudience[] }): Promise<SendWrapupResult> {
  const { data } = await supabaseAdmin.from("open_houses").select("*").eq("id", args.openHouseId).eq("agent_id", args.agentId as never).maybeSingle();
  const oh = data as OpenHouseRow | null;
  if (!oh) return { ok: false, error: "not_found" };
  const recipients = wrapupRecipients(oh, args.to);
  if (!recipients.length) return { ok: false, error: "no_recipients" };

  const [visitors, host] = await Promise.all([visitorsOf(oh.id), hostOf(String(oh.agent_id))]);
  const summary = buildWrapupSummary(visitors);
  const comment = args.comment?.trim() || null;
  const sentTo: string[] = [];
  for (const r of recipients) {
    const msg = renderWrapupEmail({ openHouse: oh, summary, hostComment: comment, host, audience: r.audience, recipientName: r.name, timeZone: host.timezone ?? undefined });
    try {
      await sendEmail({ to: r.email, subject: msg.subject, text: msg.text, html: msg.html, replyTo: host.email ?? undefined });
      sentTo.push(r.email);
    } catch (e) {
      console.warn("[open-houses.wrapup] send failed:", r.email, e instanceof Error ? e.message : e);
    }
  }
  if (!sentTo.length) return { ok: false, error: "send_failed" };
  if (host.email) {
    // The host's copy is the agent's version: it is their sheet.
    const copy = renderWrapupEmail({ openHouse: oh, summary, hostComment: comment, host, audience: "agent", recipientName: host.name, timeZone: host.timezone ?? undefined });
    await sendEmail({ to: host.email, subject: `Copy — ${copy.subject}`, text: copy.text, html: copy.html }).catch(() => undefined);
  }
  const now = new Date().toISOString();
  const { data: updated } = await supabaseAdmin
    .from("open_houses")
    .update({ summary, summary_ready_at: oh.summary_ready_at ?? now, host_comment: comment, summary_sent_at: now, summary_sent_to: sentTo, status: oh.status === "scheduled" || oh.status === "in_progress" ? "completed" : oh.status, updated_at: now } as never)
    .eq("id", oh.id)
    .select("*")
    .maybeSingle();
  return { ok: true, sentTo, summary, openHouse: (updated as OpenHouseRow | null) ?? oh };
}
