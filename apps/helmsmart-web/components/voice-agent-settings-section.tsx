import { cookies } from "next/headers";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { describeNumberSharing } from "@/lib/receptionist-agent";
import { VoiceSettings } from "@/components/voice-settings";
import { ReceptionistConfig } from "@/components/receptionist-config";
import { ReceptionistSetup } from "@/components/receptionist-setup";
import { defaultBusinessHours, type BusinessHours, type AppointmentType, type KnowledgeEntry } from "@/lib/receptionist";
import { isGoogleCalendarConfigured, isGoogleCalendarConnected, getConnectedGoogleAccount } from "@/lib/google-calendar";
import { getActivePack } from "@/lib/packs";

/**
 * All AI voice-agent configuration, surfaced inside the global Settings page so
 * every setting lives in one place. The Voice page itself stays operational
 * (stats + outbound + transcripts). This is an async server component: it loads
 * the org's voice fields, appointment types, knowledge base, and Google status,
 * then renders the existing config cards.
 */
export async function VoiceAgentSettingsSection() {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  const supabase = await createClient();

  const [{ data: org }, { data: apptTypes }, { data: knowledge }] = await Promise.all([
    supabase
      .from("organizations")
      .select("name, twilio_number, voice_agent_enabled, voice_agent_greeting, voice_agent_prompt, voice_agent_name, voice_agent_business_name, business_hours")
      .eq("id", orgId)
      .single(),
    supabase
      .from("appointment_types")
      .select("id, name, duration_minutes, description, active, sort")
      .eq("organization_id", orgId)
      .order("sort"),
    supabase
      .from("knowledge_base")
      .select("id, title, content, active, sort")
      .eq("organization_id", orgId)
      .order("sort"),
  ]);

  /*
   * Is this number actually ours?
   *
   * Read with the SERVICE client on purpose: the point is to count rows in
   * OTHER organizations, which the RLS-scoped client cannot see — and a check
   * that silently sees only your own org would always report "not shared",
   * which is the reassurance that made this invisible in the first place.
   * Only a count and a yes/no leave this function; no other tenant is named.
   */
  const serviceDb = await createServiceClient();
  const sharing = await describeNumberSharing(serviceDb, orgId);

  /*
   * Read on its own, deliberately.
   *
   * PostgREST fails the WHOLE select when one column is missing, so folding
   * booking_alert_phone into the query above would blank every voice setting on
   * this page in any environment where the migration has not run yet. This
   * codebase has already paid for that lesson: asking contacts for a "type"
   * column it does not have returned 42703 and silently emptied the caller
   * memory the receptionist was reading — see the note in known-caller.ts.
   */
  let bookingAlertPhone = "";
  {
    const { data, error } = await supabase
      .from("organizations")
      .select("booking_alert_phone")
      .eq("id", orgId)
      .maybeSingle();
    if (error) console.warn("[settings] booking_alert_phone unavailable:", error.message);
    bookingAlertPhone = (data as { booking_alert_phone?: string | null } | null)?.booking_alert_phone ?? "";
  }

  const googleConfigured = isGoogleCalendarConfigured();
  const [googleConnected, googleEmail] = googleConfigured
    ? await Promise.all([isGoogleCalendarConnected(orgId), getConnectedGoogleAccount(orgId)])
    : [false, null];

  // Canonicalize the host to www so the setup checklist never hands out the bare
  // domain (which 302-redirects and breaks Retell's POST webhooks).
  const canonicalBase = (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.helmsmart.ai").replace(
    /:\/\/helmsmart\.ai/,
    "://www.helmsmart.ai"
  );
  const businessHours = (org?.business_hours as BusinessHours | null) ?? null;
  const setupStatus = {
    numberOk: Boolean(org?.twilio_number),
    number: (org?.twilio_number as string | null) ?? null,
    hoursOk: businessHours ? Object.values(businessHours).some(Boolean) : false,
    typesOk: (apptTypes?.length ?? 0) > 0,
    typesCount: apptTypes?.length ?? 0,
    agentEnabled: Boolean(org?.voice_agent_enabled),
    googleConfigured,
    googleConnected,
    inboundUrl: `${canonicalBase}/api/retell/inbound?k=<RETELL_FUNCTION_SECRET>`,
    // Carries ?k= like the inbound URL above: the function endpoint is now gated
    // too, so a URL without it gets a 401 and the agent can't book anything.
    functionUrl: `${canonicalBase}/api/retell/function?k=<RETELL_FUNCTION_SECRET>`,
  };

  const pack = await getActivePack();

  return (
    <div className="space-y-8">
      <VoiceSettings
        contextExample={pack.voiceContextExample}
        enabled={org?.voice_agent_enabled ?? false}
        agentName={org?.voice_agent_name ?? ""}
        businessName={org?.voice_agent_business_name ?? ""}
        orgName={org?.name ?? ""}
        greeting={org?.voice_agent_greeting ?? "Hello! Thank you for calling. How can I help you today?"}
        prompt={org?.voice_agent_prompt ?? ""}
        twilioNumber={org?.twilio_number ?? null}
        sharedWith={sharing.sharedWith}
        answersThisOrg={sharing.answersThisOrg}
        bookingAlertPhone={bookingAlertPhone}
      />

      <ReceptionistConfig
        hours={(org?.business_hours as BusinessHours | null) ?? defaultBusinessHours()}
        appointmentTypes={(apptTypes ?? []) as AppointmentType[]}
        knowledge={(knowledge ?? []) as KnowledgeEntry[]}
        googleConfigured={googleConfigured}
        googleConnected={googleConnected}
        googleEmail={googleEmail}
      />

      <ReceptionistSetup status={setupStatus} />
    </div>
  );
}
