import { getReceptionistBusinessName } from "@/lib/voice-receptionist/businessName";
import { callerKind, describeAppointmentTypes, offerableAppointmentTypes } from "@repo/voice";
import { getReceptionistConfig, getBookingSettings } from "@/lib/voice-receptionist/settings";
import {
  getAssistantVoiceSettings,
  receptionistVoiceNotesFromSkills,
  voiceNotesFromSkills,
} from "@/lib/closeboss/voicePersona";
import {
  describeHours,
  defaultBusinessHours,
  safeTimezone,
  todayInTimezone,
  REAL_ESTATE_PROFILE,
  type ReceptionistContext,
} from "@repo/voice";

/**
 * Build the shared `ReceptionistContext` for a LeadSmart agent from its saved
 * Voice Receptionist config (Settings → Voice → AI Voice Receptionist), falling
 * back to the account display name + sensible defaults when a field is unset.
 *
 * Returns `null` when the receptionist is disabled, so the Retell inbound webhook
 * serves no dynamic variables (the agent answers with no prompt = effectively
 * off). The config table may not exist yet — `getReceptionistConfig` returns
 * defaults on any error, so this keeps working before the migration is applied.
 *
 * Additive — LeadSmart's existing Twilio/OpenAI-Realtime voice is untouched.
 */


export async function loadReceptionistContext(
  agentId: string,
): Promise<ReceptionistContext | null> {
  const cfg = await getReceptionistConfig(agentId);
  if (!cfg.enabled) return null;

  // The AI Receptionist's persona (Emma, by default) — her name + skill
  // playbook. Loaded once and used for both the on-call name and the notes.
  const receptionistVoice = await getAssistantVoiceSettings(agentId, "receptionist");

  // Booking on/off + per-agent office hours (one query). Booking off by default;
  // hours fall back to the engine default (Mon–Fri 9–5) when unset.
  const { enabled: bookingEnabled, hours: configuredHours } = await getBookingSettings(agentId);
  const hours = configuredHours ?? defaultBusinessHours();

  // The business name comes from BRANDING, not a second copy typed into the
  // receptionist panel. Those fields defaulted to blank, and a blank one fell
  // through to the person's own name — so an agent who skipped them had their
  // AI answering with their personal name instead of their business.
  const orgName = await getReceptionistBusinessName(agentId);
  const timezone = safeTimezone(cfg.timezone);
  const { iso: todayISO, label: todayLabel } = todayInTimezone(timezone);

  return {
    orgId: agentId,
    // CloseBoss's tenants are licensed real-estate agents, so the receptionist
    // speaks their trade: what it may not advise on, what "ready to book" sounds
    // like, which claims need the licensee. The engine is shared; this names the
    // vertical it should wear. Without it the prompt comes out generic.
    profile: REAL_ESTATE_PROFILE,
    orgName,
    // No separate Chinese brand name exists in branding, so Chinese callers
    // hear the same one. Better than a stale second copy going out of date.
    orgNameZh: orgName,
    // Her configured receptionist name wins; otherwise she introduces herself
    // by her persona name (Emma) so callers hear a real name, not silence.
    agentName: cfg.agentName || receptionistVoice.voiceName || "",
    twilioNumber: null,
    timezone,
    todayISO,
    todayLabel,
    hoursText: describeHours(hours),
    // When booking is on, the agent offers 30-minute appointments via the Retell
    // check_availability / book_appointment tools (backed by /api/retell/function).
    // When off, steer callers to a message / call-back instead.
    // Every type, because the caller is not known yet at this point. The
    // inbound route narrows this once loadKnownCaller has run — see
    // app/api/retell/inbound. This used to be one hardcoded sentence read to
    // everyone, so a seller was offered a property showing.
    typesText: bookingEnabled
      ? describeAppointmentTypes(offerableAppointmentTypes("unknown"))
      : describeAppointmentTypes([]),
    knowledgeText: cfg.extraNotes || "",
    // CloseBoss: qualification/escalation playbook from the skills
    // enabled on this agent's AI Receptionist, plus voice-channel
    // compliance guardrails. Lands under "About the business" in the
    // shared system prompt.
    extraNotes: receptionistVoiceNotesFromSkills(receptionistVoice.enabledSkills),
    greeting: cfg.greeting || "",
  };
}

/**
 * Context for the SALES ASSISTANT's outbound lead calls (follow-up,
 * reactivation). Business facts (name, timezone, hours, booking) come
 * from the shared receptionist config, but the voice identity is the
 * Sales Assistant's own: its voice name, its knowledge base, and the
 * playbook from ITS enabled skills — so the receptionist and the
 * sales assistant each speak from their own brief.
 *
 * Falls back to the receptionist's knowledge until the Sales
 * Assistant has its own, so early calls are never knowledge-less.
 */
export async function loadSalesCallContext(
  agentId: string,
): Promise<ReceptionistContext | null> {
  const base = await loadReceptionistContext(agentId);
  if (!base) return null;
  const voice = await getAssistantVoiceSettings(agentId, "sales_assistant");
  return {
    ...base,
    agentName: voice.voiceName || base.agentName,
    knowledgeText: voice.voiceKnowledge ?? base.knowledgeText,
    extraNotes: voiceNotesFromSkills(voice.enabledSkills),
  };
}
