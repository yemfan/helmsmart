"use server";

import { after } from "next/server";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { updateOrg } from "@/lib/actions/org-update";
import { decideConsent } from "@helm/dna-communication";
import { createServiceClient } from "@/lib/supabase/server";
import { loadReceptionistContext, type OutboundPurpose } from "@/lib/receptionist-agent";
import {
  placeOutboundCall,
  withinCallingHours,
  resolveOutboundAgentId,
  enqueueCalls,
  drainOutboundQueue,
} from "@/lib/outbound-queue";
import { CallNotAllowedError } from "@/lib/outbound-send";
import { describeDenial, inputsFor, loadOrgOptOuts, type OrgOptOuts } from "@/lib/consent";

type CallResult = { ok: true; name: string } | { ok: false; error: string };
/** `optedOut`: how many of the picked contacts were left out because they opted out of calls. */
type BulkResult = { ok: true; queued: number; optedOut: number } | { ok: false; error: string };

/** The sentence the owner reads when the consent guard refuses a call. */
async function callRefusal(e: CallNotAllowedError): Promise<string> {
  if (e.guard.reason === "opted_out") {
    const [tc, locale] = await Promise.all([getServerT("clients"), getServerLocale()]);
    return describeDenial(e.guard.decision, e.guard.consent, tc, locale);
  }
  return (await getServerT("voice"))("outbound.errors.consentUnavailable");
}

// Cap a single "Call all" batch so the background drain finishes within the
// function's lifetime. Larger lists are handled by clicking again (already-queued
// contacts are skipped).
const BULK_LIMIT = 15;
const STAGGER_MS = 1500;

/**
 * Place a single outbound AI call to a contact. HelmSmart-initiated (the agent
 * dials) — distinct from the owner calling someone themselves. Guards: valid
 * phone, connected number, and 8am–9pm in the business's timezone.
 */
export async function callLead(input: { clientId: string; purpose: OutboundPurpose; detail?: string }): Promise<CallResult> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return { ok: false, error: (await getServerT("voice"))("outbound.errors.noOrganization") };

  const db = await createServiceClient();

  // Load the contact and the org context in parallel (they only need orgId).
  const [{ data: client }, ctx] = await Promise.all([
    db
      .from("clients")
      .select("id, first_name, last_name, phone")
      .eq("id", input.clientId)
      .eq("organization_id", orgId)
      .single(),
    loadReceptionistContext(db, orgId),
  ]);
  if (!client) return { ok: false, error: (await getServerT("voice"))("outbound.errors.contactNotFound") };
  if (!client.phone) return { ok: false, error: (await getServerT("voice"))("outbound.errors.contactNoPhone") };
  if (!ctx.twilioNumber) return { ok: false, error: (await getServerT("voice"))("outbound.errors.noNumber") };
  if (!withinCallingHours(ctx.timezone)) return { ok: false, error: (await getServerT("voice"))("outbound.errors.outsideHours") };
  const agentId = await resolveOutboundAgentId(ctx);
  if (!agentId) return { ok: false, error: (await getServerT("voice"))("outbound.errors.noAgent") };

  const leadName = `${client.first_name}${client.last_name ? ` ${client.last_name}` : ""}`.trim();
  try {
    await placeOutboundCall(db, ctx, client, input.purpose, agentId, input.detail);
  } catch (e) {
    if (e instanceof CallNotAllowedError) return { ok: false, error: await callRefusal(e) };
    return { ok: false, error: e instanceof Error ? e.message : "Call failed to start." };
  }

  return { ok: true, name: leadName || "the contact" };
}

/**
 * Bulk "Call all": enqueue the given contacts for a purpose, then dial them in
 * the background — staggered, within calling hours, capped per batch. Returns how
 * many were newly queued (already-pending contacts are skipped).
 */
export async function callAll(input: { purpose: OutboundPurpose; clientIds: string[]; detail?: string }): Promise<BulkResult> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return { ok: false, error: (await getServerT("voice"))("outbound.errors.noOrganization") };

  const db = await createServiceClient();

  const ctx = await loadReceptionistContext(db, orgId);
  if (!ctx.twilioNumber) return { ok: false, error: (await getServerT("voice"))("outbound.errors.noNumber") };
  if (!withinCallingHours(ctx.timezone)) return { ok: false, error: (await getServerT("voice"))("outbound.errors.outsideHours") };
  const agentId = await resolveOutboundAgentId(ctx);
  if (!agentId) return { ok: false, error: (await getServerT("voice"))("outbound.errors.noAgent") };

  // Validate the requested contacts belong to this org + have a phone; cap the batch.
  const requested = Array.from(new Set(input.clientIds)).slice(0, BULK_LIMIT);
  if (!requested.length) return { ok: false, error: (await getServerT("voice"))("outbound.errors.noneSelected") };

  const { data: valid } = await db
    .from("clients")
    .select("id")
    .eq("organization_id", orgId)
    .not("phone", "is", null)
    .in("id", requested);
  const validIds = (valid ?? []).map((c) => c.id as string);
  if (!validIds.length) return { ok: false, error: (await getServerT("voice"))("outbound.errors.noneReachable") };

  // Leave out anyone who opted out of calls rather than queue a call the
  // guard at dial time would refuse. An unreadable opt-out list queues nobody.
  let optOuts: OrgOptOuts;
  try {
    optOuts = await loadOrgOptOuts(db, orgId);
  } catch (e) {
    console.error("[outbound] callAll: consent lookup failed", e);
    return { ok: false, error: (await getServerT("voice"))("outbound.errors.consentUnavailable") };
  }
  const callable = validIds.filter(
    (id) => decideConsent("call", "automated", inputsFor(optOuts, { clientId: id })).allowed,
  );
  if (!callable.length) return { ok: false, error: (await getServerT("voice"))("outbound.errors.allOptedOut") };

  const queued = await enqueueCalls(db, orgId, input.purpose, callable, input.detail);
  if (queued === 0) return { ok: false, error: (await getServerT("voice"))("outbound.errors.alreadyQueued") };

  // Dial the batch in the background so the click returns immediately.
  after(async () => {
    await drainOutboundQueue(db, orgId, { limit: BULK_LIMIT, staggerMs: STAGGER_MS });
  });

  return { ok: true, queued, optedOut: validIds.length - callable.length };
}

/** Enable/disable automatic appointment-reminder calls and/or set how long before
 *  the appointment to call (stored as minutes; clamped to 15 min .. 30 days).
 *  Either field may be sent alone: the switch saves on its own, and the lead
 *  time saves from its own button, so neither writes the other's unsaved edit.
 *
 *  Routed through `updateOrg` (the RLS client, rows asked back) rather than
 *  the service client it used to use, which discarded the result and trusted
 *  the org id in the cookie — so the panel said "Saved!" whatever happened. */
export async function saveReminderSettings(input: {
  enabled?: boolean;
  leadMinutes?: number;
}): Promise<{ ok: boolean; error?: string }> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return { ok: false, error: (await getServerT("voice"))("outbound.errors.noOrganization") };

  const patch: Record<string, unknown> = {};
  if (input.enabled !== undefined) patch.voice_reminder_enabled = input.enabled;
  if (input.leadMinutes !== undefined) {
    patch.voice_reminder_lead_minutes = Math.max(15, Math.min(43200, Math.round(input.leadMinutes || 0)));
  }
  if (Object.keys(patch).length === 0) return { ok: true };

  const res = await updateOrg(orgId, patch, "outbound.saveReminderSettings");
  if (!res.ok) return { ok: false, error: res.error };

  revalidatePath("/voice");
  return { ok: true };
}
