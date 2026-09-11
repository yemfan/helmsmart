"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { BusinessHours } from "@/lib/receptionist";
import { getServerT } from "@/lib/i18n/server";
import { updateOrg } from "@/lib/actions/org-update";

// Every write below asks for its rows back. Through the RLS client a refused
// update or delete is not an error — it matches zero rows — so without
// `.select("id")` the card said "Saved!" (or dropped the row from the list)
// over a database that never changed.

async function ctx() {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { orgId, supabase, user };
}

// ─── Business hours ─────────────────────────────────────────────────────────────

export async function saveBusinessHours(hours: BusinessHours): Promise<{ error?: string }> {
  const t = await getServerT("voice");
  const { orgId, user } = await ctx();
  if (!orgId || !user) return { error: t("errors.unauthorized") };

  const res = await updateOrg(orgId, { business_hours: hours }, "receptionist.saveBusinessHours");
  if (!res.ok) return { error: res.error };

  revalidatePath("/voice");
  return {};
}

// ─── Appointment types ──────────────────────────────────────────────────────────

export async function upsertAppointmentType(input: {
  id?: string;
  name: string;
  durationMinutes: number;
  description?: string | null;
  active?: boolean;
}): Promise<{ error?: string; id?: string }> {
  const t = await getServerT("voice");
  const { orgId, supabase, user } = await ctx();
  if (!orgId || !user) return { error: t("errors.unauthorized") };

  const name = input.name.trim();
  if (!name) return { error: t("errors.nameRequired") };

  const row = {
    organization_id: orgId,
    name,
    duration_minutes: Math.min(480, Math.max(5, Math.round(input.durationMinutes || 30))),
    description: input.description?.trim() || null,
    active: input.active ?? true,
  };

  if (input.id) {
    const { data, error } = await supabase
      .from("appointment_types")
      .update(row)
      .eq("id", input.id)
      .eq("organization_id", orgId)
      .select("id");
    if (error) return { error: t("errors.saveApptType") };
    if (!data || data.length === 0) return { error: t("errors.apptTypeRefused") };
    revalidatePath("/voice");
    return { id: input.id };
  }

  const { data, error } = await supabase
    .from("appointment_types")
    .insert(row)
    .select("id")
    .single();
  if (error || !data) return { error: t("errors.createApptType") };
  revalidatePath("/voice");
  return { id: data.id };
}

export async function deleteAppointmentType(id: string): Promise<{ error?: string }> {
  const t = await getServerT("voice");
  const { orgId, supabase, user } = await ctx();
  if (!orgId || !user) return { error: t("errors.unauthorized") };

  const { data, error } = await supabase
    .from("appointment_types")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId)
    .select("id");
  if (error) return { error: t("errors.deleteApptType") };
  if (!data || data.length === 0) return { error: t("errors.apptTypeRefused") };
  revalidatePath("/voice");
  return {};
}

// ─── Knowledge base ─────────────────────────────────────────────────────────────

export async function upsertKnowledgeEntry(input: {
  id?: string;
  title: string;
  content: string;
  active?: boolean;
}): Promise<{ error?: string; id?: string }> {
  const t = await getServerT("voice");
  const { orgId, supabase, user } = await ctx();
  if (!orgId || !user) return { error: t("errors.unauthorized") };

  const title = input.title.trim();
  const content = input.content.trim();
  if (!title || !content) return { error: t("errors.titleContentRequired") };

  const row = { organization_id: orgId, title, content, active: input.active ?? true };

  if (input.id) {
    const { data, error } = await supabase
      .from("knowledge_base")
      .update(row)
      .eq("id", input.id)
      .eq("organization_id", orgId)
      .select("id");
    if (error) return { error: t("errors.saveKnowledge") };
    if (!data || data.length === 0) return { error: t("errors.knowledgeRefused") };
    revalidatePath("/voice");
    return { id: input.id };
  }

  const { data, error } = await supabase
    .from("knowledge_base")
    .insert(row)
    .select("id")
    .single();
  if (error || !data) return { error: t("errors.createKnowledge") };
  revalidatePath("/voice");
  return { id: data.id };
}

export async function deleteKnowledgeEntry(id: string): Promise<{ error?: string }> {
  const t = await getServerT("voice");
  const { orgId, supabase, user } = await ctx();
  if (!orgId || !user) return { error: t("errors.unauthorized") };

  const { data, error } = await supabase
    .from("knowledge_base")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId)
    .select("id");
  if (error) return { error: t("errors.deleteKnowledge") };
  if (!data || data.length === 0) return { error: t("errors.knowledgeRefused") };
  revalidatePath("/voice");
  return {};
}

// ─── Google Calendar ────────────────────────────────────────────────────────────

export async function disconnectGoogleCalendar(): Promise<{ error?: string }> {
  const t = await getServerT("voice");
  const { orgId, supabase, user } = await ctx();
  if (!orgId || !user) return { error: t("errors.unauthorized") };

  const { error } = await supabase
    .from("org_oauth_tokens")
    .delete()
    .eq("organization_id", orgId)
    .eq("provider", "google");
  if (error) return { error: t("errors.disconnectCalendar") };
  revalidatePath("/voice");
  return {};
}
