"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getServerT } from "@/lib/i18n/server";
import { getMemberOrgId } from "@/lib/auth/org-context";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AutomationTrigger =
  | "invoice_overdue"
  | "invoice_paid"
  | "new_lead"
  | "campaign_sent";

export type AutomationAction = "create_task" | "send_email" | "add_note";

export interface AutomationConfig {
  // create_task
  title?: string;
  due_offset_days?: number;
  // send_email
  email_subject?: string;
  email_body?: string;
  // add_note
  note_body?: string;
}

export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  action: AutomationAction;
  config: AutomationConfig;
  run_count: number;
  last_run_at: string | null;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getOrgId(): Promise<string> {
  const orgId = (await getMemberOrgId()) ?? "";
  if (!orgId) {
    const t = await getServerT("workflows");
    throw new Error(t("automations.errors.notAuthenticated"));
  }
  return orgId;
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listAutomationRules(): Promise<AutomationRule[]> {
  let orgId: string;
  try { orgId = await getOrgId(); } catch { return []; }

  const supabase = await createClient();
  const { data } = await supabase
    .from("automation_rules")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  return (data ?? []) as AutomationRule[];
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createAutomationRule(params: {
  name: string;
  trigger: AutomationTrigger;
  action: AutomationAction;
  config: AutomationConfig;
}): Promise<string> {
  const orgId = await getOrgId();
  const supabase = await createClient();

  const { data: rule, error } = await supabase
    .from("automation_rules")
    .insert({
      organization_id: orgId,
      name: params.name,
      trigger: params.trigger,
      action: params.action,
      config: params.config,
      enabled: true,
    })
    .select("id")
    .single();

  if (error || !rule) {
    // The database's own words are logged, not shown: they are English and
    // name nothing the owner can fix.
    if (error) console.error("[automations] create error:", error.message);
    const t = await getServerT("workflows");
    throw new Error(t("automations.errors.createFailed"));
  }
  revalidatePath("/automations");
  return (rule as { id: string }).id;
}

// ─── Toggle enabled ───────────────────────────────────────────────────────────
//
// The toggle and delete return a result instead of throwing, for the rows
// check: through the RLS client a refused write matches zero rows and is not
// an error, so the switch has to be told to go back — and why.

export async function toggleAutomationRule(
  ruleId: string,
  enabled: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const t = await getServerT("workflows");
  let orgId: string;
  try { orgId = await getOrgId(); } catch { return { ok: false, error: t("automations.errors.notAuthenticated") }; }
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("automation_rules")
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("id", ruleId)
    .eq("organization_id", orgId)
    .select("id");

  if (error) {
    console.error("[automations] toggle error:", error.message);
    return { ok: false, error: t("automations.errors.toggleFailed") };
  }
  if (!data || data.length === 0) return { ok: false, error: t("automations.errors.refused") };
  revalidatePath("/automations");
  return { ok: true };
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteAutomationRule(ruleId: string): Promise<{ ok: boolean; error?: string }> {
  const t = await getServerT("workflows");
  let orgId: string;
  try { orgId = await getOrgId(); } catch { return { ok: false, error: t("automations.errors.notAuthenticated") }; }
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("automation_rules")
    .delete()
    .eq("id", ruleId)
    .eq("organization_id", orgId)
    .select("id");

  if (error) {
    console.error("[automations] delete error:", error.message);
    return { ok: false, error: t("automations.errors.deleteFailed") };
  }
  if (!data || data.length === 0) return { ok: false, error: t("automations.errors.refused") };
  revalidatePath("/automations");
  return { ok: true };
}
