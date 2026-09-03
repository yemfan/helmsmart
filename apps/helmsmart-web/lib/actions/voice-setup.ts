"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { updateOrg } from "@/lib/actions/org-update";
import { normalizePhoneE164 } from "@/lib/phone";
import { createRetellNumber, importRetellNumber, getRetellNumber } from "@/lib/retell";

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
function retellEnv(): { ok: true; agentId: string } | { ok: false; error: string } {
  if (!process.env.RETELL_API_KEY) return { ok: false, error: "RETELL_API_KEY isn't set on the server." };
  if (!process.env.RETELL_FUNCTION_SECRET) return { ok: false, error: "RETELL_FUNCTION_SECRET isn't set on the server." };
  const agentId = process.env.RETELL_AGENT_ID;
  if (!agentId) return { ok: false, error: "RETELL_AGENT_ID isn't set on the server — add the shared receptionist agent id." };
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
    throw new Error(
      `Number ${e164} was provisioned but could not be saved to the organization: ${saved.error}`,
    );
  }
  revalidatePath("/voice");
  revalidatePath("/reception");
}

/** Buy a new number and auto-wire it to the agent + inbound webhook. */
export async function provisionNumber(input: { areaCode: string; tollFree?: boolean }): Promise<ActionResult> {
  const env = retellEnv();
  if (!env.ok) return { ok: false, error: env.error };

  const org = await currentOrg();
  if (!org) return { ok: false, error: "No organization selected." };
  if (org.twilio_number) return { ok: false, error: "This business already has a number connected." };

  const areaCode = parseInt(String(input.areaCode).replace(/\D/g, ""), 10);
  if (!Number.isInteger(areaCode) || areaCode < 200 || areaCode > 999) {
    return { ok: false, error: "Enter a valid 3-digit US area code (e.g. 626)." };
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
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't buy a number right now." };
  }
}

/** Import an existing number (via its Twilio SIP trunk) and auto-wire it. */
export async function importExistingNumber(input: {
  phoneNumber: string;
  terminationUri: string;
  sipUser?: string;
  sipPass?: string;
}): Promise<ActionResult> {
  const env = retellEnv();
  if (!env.ok) return { ok: false, error: env.error };

  const org = await currentOrg();
  if (!org) return { ok: false, error: "No organization selected." };
  if (org.twilio_number) return { ok: false, error: "This business already has a number connected." };

  const norm = normalizePhoneE164(input.phoneNumber);
  if (!norm.ok) return { ok: false, error: norm.error };

  const terminationUri = input.terminationUri.trim();
  if (!terminationUri) return { ok: false, error: "Enter your SIP termination URI (e.g. yourtrunk.pstn.twilio.com)." };

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
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't import that number." };
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
  const env = retellEnv();
  if (!env.ok) return { ok: false, numberFound: false, webhookOk: false, agentOk: false, error: env.error };

  const org = await currentOrg();
  if (!org?.twilio_number) {
    return { ok: false, numberFound: false, webhookOk: false, agentOk: false, error: "No number connected yet." };
  }

  try {
    const info = await getRetellNumber(org.twilio_number);
    const webhookOk = (info.inboundWebhookUrl ?? "").startsWith(inboundWebhookUrl().split("?")[0]);
    const agentOk = info.agentIds.includes(env.agentId);
    return { ok: info.found && webhookOk && agentOk, numberFound: info.found, webhookOk, agentOk };
  } catch (e) {
    return { ok: false, numberFound: false, webhookOk: false, agentOk: false, error: e instanceof Error ? e.message : "Verification failed." };
  }
}
