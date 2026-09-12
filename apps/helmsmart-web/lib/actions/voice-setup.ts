"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { updateOrg } from "@/lib/actions/org-update";
import { normalizePhoneE164 } from "@/lib/phone";
import { createRetellNumber, importRetellNumber, getRetellNumber, updateRetellNumber } from "@/lib/retell";
import { getServerT } from "@/lib/i18n/server";
import { getMemberOrgId } from "@/lib/auth/org-context";
import { checkActionPermission } from "@/components/role-guard";

type ActionResult = { ok: boolean; number?: string; error?: string };

/**
 * Buying, importing and re-binding a number are owner/admin work.
 *
 * The first of those spends the account's money and the other two change where
 * every inbound call lands, so none of them belong to a bookkeeper or a viewer
 * who happens to open Settings. `settings.write` is held by owner and admin
 * only (`lib/permissions.ts`).
 */
async function requireNumberAdmin(): Promise<{ ok: false; error: string } | null> {
  return checkActionPermission("settings.write");
}

/**
 * Canonical inbound-webhook URL Retell should call on each inbound call. Built
 * server-side with the real secret (never exposed to the client) and forced to
 * the `www` host so Retell never hits the apex redirect.
 */
function inboundWebhookUrl(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.helmsmart.ai").replace(
    /:\/\/helmsmart\.ai/,
    "://www.helmsmart.ai"
  );
  const secret = process.env.RETELL_FUNCTION_SECRET ?? "";
  return `${base}/api/retell/inbound?k=${secret}`;
}

/** Validate the env this flow depends on; returns the shared agent id when ready. */
async function retellEnv(): Promise<{ ok: true; agentId: string } | { ok: false; error: string }> {
  const t = await getServerT("voice");
  if (!process.env.RETELL_API_KEY) return { ok: false, error: t("errors.missingApiKey") };
  if (!process.env.RETELL_FUNCTION_SECRET) return { ok: false, error: t("errors.missingFunctionSecret") };
  const agentId = process.env.RETELL_AGENT_ID;
  if (!agentId) return { ok: false, error: t("errors.missingAgentId") };
  return { ok: true, agentId };
}

async function currentOrg(): Promise<{ id: string; name: string; twilio_number: string | null } | null> {
  const orgId = await getMemberOrgId();
  if (!orgId) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("id, name, twilio_number")
    .eq("id", orgId)
    .single();
  return (data as { id: string; name: string; twilio_number: string | null } | null) ?? null;
}

/**
 * Records a number against the org. THROWS on failure, deliberately.
 *
 * This runs after a number has been provisioned — money has already been spent
 * and the number exists at the provider. Silently failing to record it leaves
 * an org paying for a line the app does not know about and cannot route, which
 * is worse than surfacing the error to whoever just clicked Buy.
 */
async function storeNumber(orgId: string, e164: string): Promise<void> {
  const saved = await updateOrg(orgId, { twilio_number: e164 }, "storeNumber");
  if (!saved.ok) {
    const t = await getServerT("voice");
    throw new Error(t("errors.numberNotStored", { number: e164, reason: saved.error }));
  }
  revalidatePath("/voice");
  revalidatePath("/reception");
}

/** Buy a new number and auto-wire it to the agent + inbound webhook. */
export async function provisionNumber(input: { areaCode: string; tollFree?: boolean }): Promise<ActionResult> {
  const t = await getServerT("voice");
  const denied = await requireNumberAdmin();
  if (denied) return denied;
  const env = await retellEnv();
  if (!env.ok) return { ok: false, error: env.error };

  const org = await currentOrg();
  if (!org) return { ok: false, error: t("errors.noOrganization") };
  if (org.twilio_number) return { ok: false, error: t("errors.alreadyHasNumber") };

  const areaCode = parseInt(String(input.areaCode).replace(/\D/g, ""), 10);
  if (!Number.isInteger(areaCode) || areaCode < 200 || areaCode > 999) {
    return { ok: false, error: t("errors.invalidAreaCode") };
  }

  try {
    const { phoneNumber } = await createRetellNumber({
      areaCode,
      tollFree: input.tollFree,
      nickname: org.name,
      agentId: env.agentId,
      inboundWebhookUrl: inboundWebhookUrl(),
    });
    const norm = normalizePhoneE164(phoneNumber);
    const e164 = norm.ok ? norm.value : phoneNumber;
    await storeNumber(org.id, e164);
    return { ok: true, number: e164 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : t("errors.buyFailed") };
  }
}

/** Import an existing number (via its Twilio SIP trunk) and auto-wire it. */
export async function importExistingNumber(input: {
  phoneNumber: string;
  terminationUri: string;
  sipUser?: string;
  sipPass?: string;
}): Promise<ActionResult> {
  const t = await getServerT("voice");
  const denied = await requireNumberAdmin();
  if (denied) return denied;
  const env = await retellEnv();
  if (!env.ok) return { ok: false, error: env.error };

  const org = await currentOrg();
  if (!org) return { ok: false, error: t("errors.noOrganization") };
  if (org.twilio_number) return { ok: false, error: t("errors.alreadyHasNumber") };

  const norm = normalizePhoneE164(input.phoneNumber);
  if (!norm.ok) return { ok: false, error: norm.error };

  const terminationUri = input.terminationUri.trim();
  if (!terminationUri) return { ok: false, error: t("errors.terminationUriRequired") };

  try {
    const { phoneNumber } = await importRetellNumber({
      phoneNumber: norm.value,
      terminationUri,
      sipUser: input.sipUser?.trim() || undefined,
      sipPass: input.sipPass?.trim() || undefined,
      nickname: org.name,
      agentId: env.agentId,
      inboundWebhookUrl: inboundWebhookUrl(),
    });
    const reNorm = normalizePhoneE164(phoneNumber);
    const e164 = reNorm.ok ? reNorm.value : phoneNumber;
    await storeNumber(org.id, e164);
    return { ok: true, number: e164 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : t("errors.importFailed") };
  }
}

/** Confirm the org's number is actually wired to our agent + inbound webhook in Retell. */
export async function verifyNumberWiring(): Promise<{
  ok: boolean;
  numberFound: boolean;
  webhookOk: boolean;
  agentOk: boolean;
  error?: string;
}> {
  const t = await getServerT("voice");
  const env = await retellEnv();
  if (!env.ok) return { ok: false, numberFound: false, webhookOk: false, agentOk: false, error: env.error };

  const org = await currentOrg();
  if (!org?.twilio_number) {
    return { ok: false, numberFound: false, webhookOk: false, agentOk: false, error: t("errors.noNumberConnected") };
  }

  try {
    const info = await getRetellNumber(org.twilio_number);
    const webhookOk = (info.inboundWebhookUrl ?? "").startsWith(inboundWebhookUrl().split("?")[0]);
    const agentOk = info.agentIds.includes(env.agentId);
    return { ok: info.found && webhookOk && agentOk, numberFound: info.found, webhookOk, agentOk };
  } catch (e) {
    return { ok: false, numberFound: false, webhookOk: false, agentOk: false, error: e instanceof Error ? e.message : t("errors.verifyFailed") };
  }
}

/**
 * Repair a number the provider holds but has bound somewhere else.
 *
 * The fix offered next to "this number isn't connected to your receptionist".
 * It buys nothing and imports nothing — it re-points an existing number at our
 * agent and our inbound webhook, which is exactly the state buying it would
 * have left it in. A number the provider has never heard of cannot be repaired
 * from here, and saying so is more use than a button that fails: that org is
 * sent to the manual URLs instead.
 */
export async function rebindNumber(): Promise<ActionResult> {
  const t = await getServerT("voice");
  const denied = await requireNumberAdmin();
  if (denied) return denied;
  const env = await retellEnv();
  if (!env.ok) return { ok: false, error: env.error };

  const org = await currentOrg();
  if (!org) return { ok: false, error: t("errors.noOrganization") };
  if (!org.twilio_number) return { ok: false, error: t("errors.noNumberConnected") };

  try {
    const info = await getRetellNumber(org.twilio_number);
    if (!info.found) return { ok: false, error: t("errors.cannotRebindUnknown") };

    await updateRetellNumber({
      phoneNumber: org.twilio_number,
      agentId: env.agentId,
      inboundWebhookUrl: inboundWebhookUrl(),
      nickname: org.name,
    });
    revalidatePath("/voice");
    revalidatePath("/settings");
    return { ok: true, number: org.twilio_number };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : t("errors.rebindFailed") };
  }
}
