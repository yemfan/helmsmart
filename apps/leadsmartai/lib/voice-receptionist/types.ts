/**
 * Per-agent AI voice receptionist configuration (Settings → Voice → AI Voice
 * Receptionist). Persisted in `voice_receptionist_settings`, consumed by the
 * Retell inbound webhook to build the agent's greeting + system prompt.
 */
import { DEFAULT_ACCOUNT_TIMEZONE } from "@/lib/agent/accountTimezone";

export type ReceptionistConfig = {
  /** When false, the inbound webhook serves no prompt (receptionist is off). */
  enabled: boolean;
  /** E.164 number customers call; the inbound webhook routes it to this config. */
  phoneNumber: string;
  /** Trade / DBA name the receptionist introduces itself with. */
  businessName: string;
  /** Chinese business name (used when the agent speaks Chinese). */
  businessNameZh: string;
  /** The receptionist's own name, e.g. "Maria" (blank = unnamed). */
  agentName: string;
  /** Custom opening line; blank = auto-generated from the business name. */
  greeting: string;
  /** IANA timezone for "today" / hours phrasing, e.g. "America/New_York". */
  timezone: string;
  /** Free-text the receptionist should know: hours, services, pricing, FAQs. */
  extraNotes: string;
  /**
   * What to do when the monthly AI voice-minutes allotment runs out:
   *   'text_back' = fall back to the SMS missed-call text-back (default)
   *   'overage'   = keep the AI answering, billed per minute
   * (Upgrading is a CTA, not a stored behavior.)
   */
  voiceLimitBehavior: "text_back" | "overage";
};

/** Raw row shape from `voice_receptionist_settings` (snake_case, nullable). */
export type ReceptionistConfigRow = {
  agent_id: number | string;
  enabled: boolean | null;
  phone_number: string | null;
  business_name: string | null;
  business_name_zh: string | null;
  agent_name: string | null;
  greeting: string | null;
  timezone: string | null;
  extra_notes: string | null;
  voice_limit_behavior?: string | null;
  created_at?: string;
  updated_at?: string;
};

export const DEFAULT_RECEPTIONIST_CONFIG: ReceptionistConfig = {
  enabled: true,
  phoneNumber: "",
  businessName: "",
  businessNameZh: "",
  agentName: "",
  greeting: "",
  timezone: DEFAULT_ACCOUNT_TIMEZONE,
  extraNotes: "",
  voiceLimitBehavior: "text_back",
};
