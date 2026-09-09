"use server";

import { cookies } from "next/headers";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { checkActionPermission } from "@/components/role-guard";
import { getServerT } from "@/lib/i18n/server";

export interface FormField {
  id: string;
  type: "text" | "email" | "phone" | "textarea" | "select" | "checkbox";
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[]; // for select fields
}

export interface FormDefinition {
  id: string;
  slug: string;
  title: string;
  description?: string;
  fields: FormField[];
  success_message: string;
  auto_create_client: boolean;
  notify_email?: string;
  notify_sms: boolean;
  redirect_url?: string;
  submission_count: number;
  is_active: boolean;
  created_at: string;
}

/**
 * List all forms for the current org
 */
export async function listForms(): Promise<FormDefinition[]> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return [];

  const supabase = await createClient();

  const { data } = await supabase
    .from("form_definitions")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  return (data ?? []) as FormDefinition[];
}

/**
 * Get a single form by ID
 */
export async function getForm(formId: string): Promise<FormDefinition | null> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return null;

  const supabase = await createClient();

  const { data } = await supabase
    .from("form_definitions")
    .select("*")
    .eq("id", formId)
    .eq("organization_id", orgId)
    .single();

  return data as FormDefinition | null;
}

/**
 * Create a new form
 */
export async function createForm(input: {
  title: string;
  description?: string;
  slug: string;
  fields: FormField[];
  successMessage?: string;
  autoCreateClient?: boolean;
  notifyEmail?: string;
  notifySms?: boolean;
  redirectUrl?: string;
}): Promise<{ ok: boolean; formId?: string; error?: string }> {
  const denied = await checkActionPermission("forms.write");
  if (denied) return denied;

  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  const t = await getServerT("marketing");
  if (!orgId) return { ok: false, error: t("errors.notAuthenticated") };

  const db = await createServiceClient();

  const { data: form, error } = await db
    .from("form_definitions")
    .insert({
      organization_id: orgId,
      slug: input.slug,
      title: input.title,
      description: input.description || null,
      fields: input.fields,
      success_message: input.successMessage || "Thanks! We'll be in touch shortly.",
      auto_create_client: input.autoCreateClient ?? true,
      notify_email: input.notifyEmail || null,
      notify_sms: input.notifySms ?? false,
      redirect_url: input.redirectUrl || null,
    })
    .select("id")
    .single();

  if (error || !form) {
    console.error("[forms] create error:", error);
    return { ok: false, error: error?.message || t("errors.forms.createFailed") };
  }

  revalidatePath("/forms");
  return { ok: true, formId: form.id };
}

/**
 * Update a form's definition
 */
export async function updateForm(
  formId: string,
  input: Partial<{
    title: string;
    description: string;
    slug: string;
    fields: FormField[];
    successMessage: string;
    autoCreateClient: boolean;
    notifyEmail: string;
    notifySms: boolean;
    redirectUrl: string;
    isActive: boolean;
  }>
): Promise<{ ok: boolean; error?: string }> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  const t = await getServerT("marketing");
  if (!orgId) return { ok: false, error: t("errors.notAuthenticated") };

  const db = await createServiceClient();

  const updates: Record<string, unknown> = {};
  if (input.title !== undefined) updates.title = input.title;
  if (input.description !== undefined) updates.description = input.description || null;
  if (input.slug !== undefined) updates.slug = input.slug;
  if (input.fields !== undefined) updates.fields = input.fields;
  if (input.successMessage !== undefined) updates.success_message = input.successMessage;
  if (input.autoCreateClient !== undefined) updates.auto_create_client = input.autoCreateClient;
  if (input.notifyEmail !== undefined) updates.notify_email = input.notifyEmail || null;
  if (input.notifySms !== undefined) updates.notify_sms = input.notifySms;
  if (input.redirectUrl !== undefined) updates.redirect_url = input.redirectUrl || null;
  if (input.isActive !== undefined) updates.is_active = input.isActive;

  const { error } = await db
    .from("form_definitions")
    .update(updates)
    .eq("id", formId)
    .eq("organization_id", orgId);

  if (error) {
    console.error("[forms] update error:", error);
    return { ok: false, error: error.message };
  }

  revalidatePath("/forms");
  revalidatePath(`/forms/${formId}`);
  return { ok: true };
}

/**
 * Delete a form
 */
export async function deleteForm(formId: string): Promise<{ ok: boolean; error?: string }> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  const t = await getServerT("marketing");
  if (!orgId) return { ok: false, error: t("errors.notAuthenticated") };

  const db = await createServiceClient();

  const { error } = await db
    .from("form_definitions")
    .delete()
    .eq("id", formId)
    .eq("organization_id", orgId);

  if (error) {
    console.error("[forms] delete error:", error);
    return { ok: false, error: error.message };
  }

  revalidatePath("/forms");
  return { ok: true };
}

/**
 * Get submissions for a form
 */
export async function getFormSubmissions(formId: string, limit = 100) {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return [];

  const supabase = await createClient();

  const { data } = await supabase
    .from("form_submissions")
    .select("id, name, email, phone, data, client_id, referrer, created_at")
    .eq("form_id", formId)
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return data ?? [];
}
