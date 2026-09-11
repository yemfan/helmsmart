"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActivePack } from "@/lib/packs";
import { checkEligibility, type EligibilityResult } from "@/lib/integrations/stedi";
import { getMemberOrgId } from "@/lib/auth/org-context";

/**
 * Run a real-time insurance eligibility check for a patient and store the result.
 * DoctorSmart (medical pack) only. The stored row doubles as the audit trail.
 */
export async function checkPatientEligibility(clientId: string): Promise<EligibilityResult> {
  const pack = await getActivePack();
  if (pack.id !== "medical") {
    throw new Error("Eligibility checks are a DoctorSmart feature.");
  }

  const orgId = await getMemberOrgId();
  if (!orgId) throw new Error("Not authenticated");

  const supabase = await createClient();
  const [{ data: org }, { data: client }, { data: { user } }] = await Promise.all([
    supabase.from("organizations").select("name, npi").eq("id", orgId).single(),
    supabase
      .from("clients")
      .select("first_name, last_name, date_of_birth, insurance_payer_id, insurance_payer_name, insurance_member_id")
      .eq("id", clientId)
      .eq("organization_id", orgId)
      .single(),
    supabase.auth.getUser(),
  ]);

  if (!org?.npi) throw new Error("Add your practice NPI in Settings before checking eligibility.");
  if (!client) throw new Error("Patient not found.");
  if (!client.insurance_payer_id || !client.insurance_member_id) {
    throw new Error("Add the patient's insurance payer and member ID first.");
  }
  if (!client.date_of_birth) throw new Error("Add the patient's date of birth first.");

  const result = await checkEligibility({
    npi: org.npi,
    organizationName: org.name,
    payerId: client.insurance_payer_id,
    firstName: client.first_name,
    lastName: client.last_name ?? "",
    dateOfBirth: client.date_of_birth,
    memberId: client.insurance_member_id,
  });

  await supabase.from("eligibility_checks").insert({
    organization_id: orgId,
    client_id: clientId,
    status: result.status,
    plan_name: result.planName,
    payer_name: client.insurance_payer_name,
    copay: result.copay,
    coinsurance: result.coinsurance,
    deductible: result.deductible,
    deductible_remaining: result.deductibleRemaining,
    raw: result.raw as never,
    error: result.error,
    checked_by: user?.id ?? null,
  });

  revalidatePath(`/clients/${clientId}`);
  return result;
}

/** Save a patient's insurance identifiers (medical pack). */
export async function updateClientInsurance(
  clientId: string,
  fields: { payerId: string; payerName: string; memberId: string; dateOfBirth: string },
): Promise<void> {
  const pack = await getActivePack();
  if (pack.id !== "medical") throw new Error("Insurance is a DoctorSmart feature.");

  const orgId = await getMemberOrgId();
  if (!orgId) throw new Error("Not authenticated");

  const supabase = await createClient();
  const { error } = await supabase
    .from("clients")
    .update({
      insurance_payer_id: fields.payerId.trim() || null,
      insurance_payer_name: fields.payerName.trim() || null,
      insurance_member_id: fields.memberId.trim() || null,
      date_of_birth: fields.dateOfBirth || null,
    })
    .eq("id", clientId)
    .eq("organization_id", orgId);
  if (error) throw new Error(error.message);

  revalidatePath(`/clients/${clientId}`);
}

/** Save the practice NPI used as the requesting provider in eligibility checks. */
export async function updateOrgNpi(npi: string): Promise<void> {
  const pack = await getActivePack();
  if (pack.id !== "medical") throw new Error("NPI is a DoctorSmart feature.");

  const orgId = await getMemberOrgId();
  if (!orgId) throw new Error("Not authenticated");

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({ npi: npi.trim() || null })
    .eq("id", orgId);
  if (error) throw new Error(error.message);

  revalidatePath("/settings");
}
