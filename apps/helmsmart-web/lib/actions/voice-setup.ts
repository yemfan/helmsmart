"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { updateOrg } from "@/lib/actions/org-update";
import { normalizePhoneE164 } from "@/lib/phone";
import { createRetellNumber, importRetellNumber, getRetellNumber } from "@/lib/retell";
import { getServerT } from "@/lib/i18n/server";

type ActionResult = { ok: boolean; number?: string; error?: string };

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
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
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
