"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { runAutomations } from "@/lib/automation-engine";
import { checkActionPermission } from "@/components/role-guard";
import { notifySlackNewLead } from "@/lib/integrations/slack";
import {
  patchClient as patchClientRevenue,
  deleteClient as deleteClientRevenue,
} from "@helm/dna-revenue";
import { getServerT } from "@/lib/i18n/server";
import { parseContactLanguage } from "@/lib/i18n/contactLocale";

/**
 * Recalculates and updates a client's lifetime_value from paid invoices.
 * Called after marking an invoice paid (session auth or service role).
 */
export async function refreshClientLifetimeValue(clientId: string, orgId: string) {
  const supabase = await createServiceClient();
  const { data } = await supabase
    .from("invoices")
    .select("total")
    .eq("client_id", clientId)
    .eq("organization_id", orgId)
    .eq("status", "paid");

  const lifetime = (data ?? []).reduce((s, i) => s + Number(i.total), 0);
  await supabase
    .from("clients")
    .update({ lifetime_value: lifetime })
    .eq("id", clientId)
    .eq("organization_id", orgId);
}

export type ClientState = { error?: string; success?: boolean } | null;

// ── Create ────────────────────────────────────────────────────────────────────

export async function createClient_(
  _: ClientState,
  formData: FormData
): Promise<ClientState> {
  const t = await getServerT("clients");
  const denied = await checkActionPermission("clients.write");
  if (denied) return { error: denied.error };

  const firstName = (formData.get("first_name") as string)?.trim();
  if (!firstName) return { error: t("errors.firstNameRequired") };

  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return { error: t("errors.noOrganization") };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: t("errors.unauthorized") };

  const tagsRaw = (formData.get("tags") as string)?.trim();
  const tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];

  const { error } = await supabase.from("clients").insert({
    organization_id: orgId,
    first_name: firstName,
    last_name: (formData.get("last_name") as string)?.trim() || null,
    company: (formData.get("company") as string)?.trim() || null,
    email: (formData.get("email") as string)?.trim() || null,
    phone: (formData.get("phone") as string)?.trim() || null,
    status: (formData.get("status") as string) || "lead",
    source: (formData.get("source") as string)?.trim() || null,
    notes: (formData.get("notes") as string)?.trim() || null,
    tags: tags.length ? tags : null,
    preferred_language: parseContactLanguage(formData.get("preferred_language")),
  });

  if (error) {
    console.error("[clients] create error:", error);
    return { error: t("errors.createFailed") };
  }

  revalidatePath("/clients");

  // Fire new_lead automation if status is lead
  const status = (formData.get("status") as string) || "lead";
  const lastName = (formData.get("last_name") as string)?.trim();
  const clientName = [firstName, lastName].filter(Boolean).join(" ");
  const email = (formData.get("email") as string)?.trim() || null;
  const phone = (formData.get("phone") as string)?.trim() || null;

  if (status === "lead") {
    // Fire and forget — don't await to keep form fast
    runAutomations("new_lead", {
      orgId,
      clientName,
      clientEmail: email,
    }).catch((e) => console.error("[automations] new_lead failed:", e));
  }

  // Slack notification for new lead/client
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  void notifySlackNewLead(orgId, {
    name: clientName,
    email: email ?? undefined,
    phone: phone ?? undefined,
    source: (formData.get("source") as string)?.trim() || "manual",
    clientUrl: `${appUrl}/clients`,
  });

  return { success: true };
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateClient(
  _: ClientState,
  formData: FormData
): Promise<ClientState> {
  const t = await getServerT("clients");
  const clientId = formData.get("client_id") as string;
  if (!clientId) return { error: t("errors.missingClientId") };

  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return { error: t("errors.noOrganization") };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: t("errors.unauthorized") };

  const tagsRaw = (formData.get("tags") as string)?.trim();
  const tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];

  // Scoped to the current organization, and the rows asked back: through the
  // RLS client a refused update matches zero rows and is not an error, so
  // without `.select("id")` the form said "Saved!" over an unchanged row.
  const { data, error } = await supabase
    .from("clients")
    .update({
      first_name: (formData.get("first_name") as string)?.trim(),
      last_name: (formData.get("last_name") as string)?.trim() || null,
      company: (formData.get("company") as string)?.trim() || null,
      email: (formData.get("email") as string)?.trim() || null,
      phone: (formData.get("phone") as string)?.trim() || null,
      status: (formData.get("status") as string) || "lead",
      source: (formData.get("source") as string)?.trim() || null,
      notes: (formData.get("notes") as string)?.trim() || null,
      tags: tags.length ? tags : null,
      preferred_language: parseContactLanguage(formData.get("preferred_language")),
    })
    .eq("id", clientId)
    .eq("organization_id", orgId)
    .select("id");

  if (error) {
    console.error("[clients] update error:", error);
    return { error: t("errors.updateFailed") };
  }
  if (!data || data.length === 0) return { error: t("errors.updateRefused") };

  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  return { success: true };
}

// ── Patch (lightweight field update) ─────────────────────────────────────────
// Used by pipeline board and other components that need to update specific fields
// without going through the full FormData flow.
//
// Returns a result rather than throwing: the pipeline board moves a card before
// the write lands, and it needs to know — in the owner's language — whether to
// put the card back. A thrown message never reaches a production client intact.

export async function patchClient(
  clientId: string,
  patch: Partial<{
    pipeline_stage: string;
    expected_value: number | null;
    pipeline_note: string | null;
    status: string;
    stage_changed_at: string;
  }>
): Promise<{ ok: boolean; error?: string }> {
  const t = await getServerT("clients");
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return { ok: false, error: t("errors.noOrganization") };

  const supabase = await createClient();
  let updated: number;
  try {
    ({ updated } = await patchClientRevenue(supabase, orgId, clientId, patch));
  } catch (e) {
    console.error("[clients] patch error:", e);
    return { ok: false, error: t("errors.updateFailed") };
  }
  if (updated === 0) return { ok: false, error: t("errors.updateRefused") };

  revalidatePath("/pipeline");
  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deleteClient(clientId: string): Promise<{ error?: string }> {
  const t = await getServerT("clients");
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return { error: t("errors.unauthorized") };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: t("errors.unauthorized") };

  try {
    await deleteClientRevenue(supabase, orgId, clientId);
  } catch {
    return { error: t("errors.deleteFailed") };
  }

  revalidatePath("/clients");
  return {};
}
