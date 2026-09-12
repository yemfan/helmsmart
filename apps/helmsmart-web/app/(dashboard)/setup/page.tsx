import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SetupWizard } from "@/components/setup-wizard";
import { activationState, parseStepId } from "@/lib/activation";
import { loadActivationFacts } from "@/lib/activation-facts";
import { getMemberOrgId } from "@/lib/auth/org-context";
import { EMPTY_PROFILE } from "@/lib/business-profile";
import { getServerT } from "@/lib/i18n/server";
import { getMyRole, hasPermission } from "@/lib/rbac";
import { defaultBusinessHours, type AppointmentType, type BusinessHours } from "@/lib/receptionist";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("auth");
  return { title: t("setup.meta.title") };
}

/**
 * Getting a new owner from "account created" to "a call was answered".
 *
 * Before this, `createOrg` redirected straight to /home — a finance dashboard
 * of zeros for a business that had not invoiced anyone yet — and the website
 * the owner had just typed was stored and read by nothing. The account was
 * live and the product was not.
 *
 * Five steps, each of which writes through the SAME action Settings uses, so
 * the two screens configure one receptionist rather than two. Every step is
 * skippable, and where the owner is up to is derived from the rows themselves
 * (`lib/activation.ts`) rather than a "completed" flag — so leaving halfway,
 * closing the tab, or changing something later in Settings all land in the
 * right place.
 */
export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const orgId = await getMemberOrgId();
  if (!orgId) redirect("/onboarding");

  const supabase = await createClient();
  /*
   * The business-profile columns are NOT in this select.
   *
   * PostgREST fails the whole select when one column is missing, and on Core
   * `website`, `business_category`, `business_location` and
   * `business_description` are missing — migrations 00085/00086 have not been
   * applied there. Asking for them here would blank the greeting, the briefing,
   * the hours and the number all at once, and the wizard would offer to set up
   * a receptionist that is already set up. `loadActivationFacts` reads them
   * separately, tolerates their absence, and falls back to the knowledge_base
   * mirror.
   */
  const [{ data: org }, { data: apptTypes }, read] = await Promise.all([
    supabase
      .from("organizations")
      .select(
        "name, twilio_number, voice_agent_enabled, voice_agent_name, voice_agent_business_name, voice_agent_greeting, voice_agent_prompt, business_hours",
      )
      .eq("id", orgId)
      .maybeSingle(),
    supabase
      .from("appointment_types")
      .select("id, name, duration_minutes, description, active, sort")
      .eq("organization_id", orgId)
      .order("sort"),
    loadActivationFacts(orgId),
  ]);

  /*
   * Read on its own, deliberately — the same reason `voice-agent-settings-
   * section.tsx` states: PostgREST fails the WHOLE select when one column is
   * missing, so folding this into the query above would blank every voice
   * setting on this page wherever the migration has not run.
   *
   * It is read at all because step 2 saves through `saveVoiceSettings`, which
   * writes `booking_alert_phone` from what it is handed — so passing nothing
   * would CLEAR an alert number the owner had already set in Settings. A setup
   * step must not quietly undo a setting it never showed.
   */
  let bookingAlertPhone = "";
  {
    const { data, error } = await supabase
      .from("organizations")
      .select("booking_alert_phone")
      .eq("id", orgId)
      .maybeSingle();
    if (error) console.warn("[setup] booking_alert_phone unavailable:", error.message);
    bookingAlertPhone = (data as { booking_alert_phone?: string | null } | null)?.booking_alert_phone ?? "";
  }

  /*
   * Buying a number spends the account's money and importing one moves where
   * every inbound call lands, so both are owner/admin work — the same test
   * `voice-agent-settings-section.tsx` applies, because it is the same control.
   * `lib/actions/voice-setup.ts` refuses regardless; this only avoids offering
   * someone a button whose only possible outcome is a refusal.
   */
  const role = await getMyRole();
  const canManageNumber = role ? hasPermission(role, "settings.write") : false;

  const profile = read?.profile ?? EMPTY_PROFILE;
  const state = activationState(
    read?.facts ?? {
      businessDescription: null,
      businessCategory: null,
      greeting: null,
      prompt: null,
      businessHours: null,
      appointmentTypeCount: 0,
      twilioNumber: null,
      firstInboundCallAt: null,
    },
  );

  // Same canonicalisation as the Settings checklist: the bare domain 302s, and
  // a redirect breaks Retell's POST webhooks, so the URL handed out is www.
  const canonicalBase = (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.helmsmart.ai").replace(
    /:\/\/helmsmart\.ai/,
    "://www.helmsmart.ai",
  );

  const row = (org ?? {}) as Record<string, unknown>;
  const params = await searchParams;

  return (
    <SetupWizard
      initialStep={parseStepId(params.step) ?? state.next ?? "call"}
      state={state}
      org={{
        name: (row.name as string | null) ?? "",
        website: profile.website,
        category: profile.category,
        location: profile.location,
        description: profile.description,
        twilioNumber: (row.twilio_number as string | null) ?? null,
        voiceAgentEnabled: Boolean(row.voice_agent_enabled),
        agentName: (row.voice_agent_name as string | null) ?? "",
        businessName: (row.voice_agent_business_name as string | null) ?? "",
        greeting: (row.voice_agent_greeting as string | null) ?? "",
        prompt: (row.voice_agent_prompt as string | null) ?? "",
        hours: ((row.business_hours as BusinessHours | null) ?? defaultBusinessHours()),
        hoursSet: Boolean(row.business_hours),
        bookingAlertPhone,
      }}
      appointmentTypes={(apptTypes ?? []) as AppointmentType[]}
      canManageNumber={canManageNumber}
      inboundUrl={`${canonicalBase}/api/retell/inbound?k=<RETELL_FUNCTION_SECRET>`}
      functionUrl={`${canonicalBase}/api/retell/function?k=<RETELL_FUNCTION_SECRET>`}
    />
  );
}
