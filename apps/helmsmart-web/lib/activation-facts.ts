import { createClient } from "@/lib/supabase/server";
import type { ActivationFacts } from "@/lib/activation";
import {
  PROFILE_TITLE,
  mergeProfile,
  parseProfile,
  type BusinessProfile,
} from "@/lib/business-profile";
import type { BusinessHours } from "@/lib/receptionist";

/**
 * Read what the setup state and the guided setup both depend on, with the RLS
 * client. One loader for both readers, so the wizard and the /home checklist
 * cannot answer "are you set up?" from different queries.
 *
 * THE THREE SELECTS ARE THREE ON PURPOSE. PostgREST fails the WHOLE select when
 * any one column is missing, and on the Core project the business-profile
 * columns ARE missing — migrations 00085/00086 have not been applied there.
 * Asking for them alongside `voice_agent_prompt` would blank every voice field
 * on the page and report a configured receptionist as unconfigured. So the
 * columns that certainly exist are read on their own, the ones that may not are
 * read separately and tolerated, and the profile falls back to the
 * `knowledge_base` mirror, which exists everywhere.
 *
 * Plain server module, no `"use server"`: it is called by pages and by actions,
 * and it takes the org id rather than resolving one, so the membership check
 * stays where it belongs in the caller.
 */
export type ActivationRead = { facts: ActivationFacts; profile: BusinessProfile; profileColumnsExist: boolean };

export async function loadActivationFacts(orgId: string): Promise<ActivationRead | null> {
  if (!orgId) return null;
  const supabase = await createClient();

  const [{ data: org }, profileRead, mirror, types, firstCall] = await Promise.all([
    supabase
      .from("organizations")
      .select("voice_agent_greeting, voice_agent_prompt, business_hours, twilio_number")
      .eq("id", orgId)
      .maybeSingle(),
    supabase
      .from("organizations")
      .select("website, business_category, business_location, business_description")
      .eq("id", orgId)
      .maybeSingle(),
    supabase
      .from("knowledge_base")
      .select("content")
      .eq("organization_id", orgId)
      .eq("title", PROFILE_TITLE)
      .limit(1)
      .maybeSingle(),
    supabase.from("appointment_types").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
    supabase
      .from("voice_sessions")
      .select("created_at")
      .eq("organization_id", orgId)
      .eq("direction", "inbound")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!org) return null;

  const profileColumnsExist = !profileRead.error;
  if (profileRead.error) {
    console.warn("[activation] business-profile columns unavailable:", profileRead.error.message);
  }
  const columns = (profileRead.data ?? null) as Record<string, string | null> | null;
  const profile = mergeProfile(
    columns && {
      website: columns.website ?? "",
      category: columns.business_category ?? "",
      location: columns.business_location ?? "",
      description: columns.business_description ?? "",
    },
    parseProfile((mirror.data as { content?: string | null } | null)?.content),
  );

  const row = org as Record<string, unknown>;
  return {
    profile,
    profileColumnsExist,
    facts: {
      businessDescription: profile.description || null,
      businessCategory: profile.category || null,
      greeting: (row.voice_agent_greeting as string | null) ?? null,
      prompt: (row.voice_agent_prompt as string | null) ?? null,
      businessHours: (row.business_hours as BusinessHours | null) ?? null,
      appointmentTypeCount: types.count ?? 0,
      twilioNumber: (row.twilio_number as string | null) ?? null,
      firstInboundCallAt: (firstCall.data?.created_at as string | null) ?? null,
    },
  };
}
