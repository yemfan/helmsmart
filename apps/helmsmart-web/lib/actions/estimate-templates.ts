"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { EstimateLine } from "@/lib/actions/estimates";
import { getServerT } from "@/lib/i18n/server";
import { getMemberOrgId } from "@/lib/auth/org-context";

export type EstimateTemplate = {
  id: string;
  name: string;
  tax_rate: number;   // fraction (0.0875)
  notes: string | null;
  lines: EstimateLine[];
};

async function getOrgId(): Promise<string | null> {
  return getMemberOrgId();
}

export async function listEstimateTemplates(): Promise<EstimateTemplate[]> {
  const orgId = await getOrgId();
  if (!orgId) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("estimate_templates")
    .select("id, name, tax_rate, notes, lines")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });
  return (data ?? []) as EstimateTemplate[];
}

export async function createEstimateTemplate(data: {
  name: string;
  taxRate: number;        // fraction, matching estimates.tax_rate
  notes: string | null;
  lines: EstimateLine[];
}): Promise<string> {
  const t = await getServerT("books");
  const orgId = await getOrgId();
  if (!orgId) throw new Error(t("estimates.errors.noOrg"));
  if (!data.name.trim()) throw new Error(t("estimates.errors.templateNameRequired"));
  if (!data.lines.length) throw new Error(t("estimates.errors.lineRequired"));

  const supabase = await createClient();
  const { data: tpl, error } = await supabase
    .from("estimate_templates")
    .insert({
      organization_id: orgId,
      name: data.name.trim(),
      tax_rate: data.taxRate,
      notes: data.notes,
      lines: data.lines,
    })
    .select("id")
    .single();

  if (error || !tpl)
    throw new Error(error?.message ?? t("estimates.errors.templateSaveFailed"));

  revalidatePath("/books/estimates/templates");
  revalidatePath("/books/estimates/new");
  return tpl.id;
}

export async function deleteEstimateTemplate(id: string): Promise<void> {
  const t = await getServerT("books");
  const orgId = await getOrgId();
  if (!orgId) throw new Error(t("estimates.errors.noOrg"));
  const supabase = await createClient();
  await supabase
    .from("estimate_templates")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId);
  revalidatePath("/books/estimates/templates");
}
