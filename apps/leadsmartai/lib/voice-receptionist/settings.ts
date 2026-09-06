import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAccountTimezone } from "@/lib/agent/accountTimezone";
import { type BusinessHours, DAY_KEYS } from "@repo/voice";
import {
  DEFAULT_RECEPTIONIST_CONFIG,
  type ReceptionistConfig,
  type ReceptionistConfigRow,
} from "./types";

export { DEFAULT_RECEPTIONIST_CONFIG };
export type { ReceptionistConfig };

const SELECT_COLS =
  "agent_id, enabled, phone_number, business_name, business_name_zh, agent_name, greeting, extra_notes, voice_limit_behavior";

/**
 * The timezone is NOT read from this row. There is one timezone per account
 * (agents.timezone) and the caller fills it in - see
 * lib/agent/accountTimezone.ts for why the second one had to go.
 */
function mapRow(row: ReceptionistConfigRow): Omit<ReceptionistConfig, "timezone"> {
  return {
    enabled: row.enabled ?? true,
    phoneNumber: row.phone_number ?? "",
    businessName: row.business_name ?? "",
    businessNameZh: row.business_name_zh ?? "",
    agentName: row.agent_name ?? "",
    greeting: row.greeting ?? "",
    extraNotes: row.extra_notes ?? "",
    voiceLimitBehavior: row.voice_limit_behavior === "overage" ? "overage" : "text_back",
  };
}

/**
 * Read an agent's receptionist config. Returns defaults for an unknown agent,
 * missing row, or any error (incl. the table/column not existing yet) — so the
 * receptionist keeps working on defaults before migrations are applied.
 */
export async function getReceptionistConfig(
  agentId: string | null | undefined,
): Promise<ReceptionistConfig> {
  if (!agentId) return { ...DEFAULT_RECEPTIONIST_CONFIG };
  try {
    const { data, error } = await supabaseAdmin
      .from("voice_receptionist_settings")
      .select(SELECT_COLS)
      .eq("agent_id", agentId as never)
      .maybeSingle();
    const timezone = await getAccountTimezone(agentId);
    if (error || !data) return { ...DEFAULT_RECEPTIONIST_CONFIG, timezone };
    return { ...mapRow(data as unknown as ReceptionistConfigRow), timezone };
  } catch {
    return { ...DEFAULT_RECEPTIONIST_CONFIG };
  }
}

/** Validate a stored business_hours blob into a clean BusinessHours, or null. */
function sanitizeBusinessHours(raw: unknown): BusinessHours | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  const out = {} as BusinessHours;
  let any = false;
  for (const d of DAY_KEYS) {
    const v = src[d];
    if (
      v &&
      typeof v === "object" &&
      typeof (v as { open?: unknown }).open === "string" &&
      typeof (v as { close?: unknown }).close === "string" &&
      /^\d{1,2}:\d{2}$/.test((v as { open: string }).open) &&
      /^\d{1,2}:\d{2}$/.test((v as { close: string }).close)
    ) {
      out[d] = { open: (v as { open: string }).open, close: (v as { close: string }).close };
      any = true;
    } else {
      out[d] = null;
    }
  }
  return any ? out : null;
}

/**
 * Booking settings (enabled + per-agent hours) for the inbound hot path. One
 * query post-migration; falls back to a booking_enabled-only read when the
 * business_hours column doesn't exist yet, so an agent who already has booking
 * on never breaks before this migration. hours is null when unset (callers fall
 * back to the default Mon–Fri 9–5).
 */
export async function getBookingSettings(
  agentId: string | null | undefined,
): Promise<{ enabled: boolean; hours: BusinessHours | null }> {
  if (!agentId) return { enabled: false, hours: null };
  try {
    const { data, error } = await supabaseAdmin
      .from("voice_receptionist_settings")
      .select("booking_enabled, business_hours")
      .eq("agent_id", agentId as never)
      .maybeSingle();
    if (!error && data) {
      const d = data as { booking_enabled?: boolean | null; business_hours?: unknown };
      return { enabled: Boolean(d.booking_enabled), hours: sanitizeBusinessHours(d.business_hours) };
    }
  } catch {
    /* fall through to the column-absent fallback */
  }
  try {
    const { data } = await supabaseAdmin
      .from("voice_receptionist_settings")
      .select("booking_enabled")
      .eq("agent_id", agentId as never)
      .maybeSingle();
    return {
      enabled: Boolean((data as { booking_enabled?: boolean | null } | null)?.booking_enabled),
      hours: null,
    };
  } catch {
    return { enabled: false, hours: null };
  }
}

/** Persist an agent's office hours (jsonb). Upsert touches only business_hours,
 *  so it never disturbs the rest of the config. Returns ok:false with the error
 *  message if the column doesn't exist yet (migration not applied). */
export async function setBusinessHours(
  agentId: string,
  hours: BusinessHours | null,
): Promise<{ ok: boolean; error?: string }> {
  const clean = hours ? sanitizeBusinessHours(hours) : null;
  try {
    const { error } = await supabaseAdmin.from("voice_receptionist_settings").upsert(
      {
        agent_id: agentId as never,
        business_hours: clean as never,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "agent_id" },
    );
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save hours." };
  }
}

/**
 * Resolve the dialed E.164 number to the agent whose receptionist answers it —
 * the dynamic, multi-tenant routing: each agent's config row stores the number
 * customers call. Returns null on no match / error (incl. the phone_number
 * column not existing yet), so the caller can fall back.
 */
export async function resolveAgentIdByReceptionistNumber(
  toE164: string,
): Promise<string | null> {
  const num = (toE164 || "").trim();
  if (!num) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("voice_receptionist_settings")
      .select("agent_id")
      .eq("phone_number", num as never)
      .maybeSingle();
    if (error || !data) return null;
    const id = (data as { agent_id?: unknown }).agent_id;
    return id != null ? String(id) : null;
  } catch {
    return null;
  }
}

export type UpsertReceptionistConfigInput = Partial<ReceptionistConfig>;

/** Insert/replace an agent's receptionist config (merges onto current values). */
export async function upsertReceptionistConfig(
  agentId: string,
  input: UpsertReceptionistConfigInput,
): Promise<ReceptionistConfig> {
  const current = await getReceptionistConfig(agentId);
  const next: ReceptionistConfig = {
    enabled: input.enabled ?? current.enabled,
    phoneNumber: input.phoneNumber ?? current.phoneNumber,
    businessName: input.businessName ?? current.businessName,
    businessNameZh: input.businessNameZh ?? current.businessNameZh,
    agentName: input.agentName ?? current.agentName,
    greeting: input.greeting ?? current.greeting,
    // Not settable here. One timezone per account, changed in one place.
    timezone: current.timezone,
    extraNotes: input.extraNotes ?? current.extraNotes,
    voiceLimitBehavior: input.voiceLimitBehavior ?? current.voiceLimitBehavior,
  };

  const { error } = await supabaseAdmin.from("voice_receptionist_settings").upsert(
    {
      agent_id: agentId as never,
      enabled: next.enabled,
      phone_number: next.phoneNumber || null,
      business_name: next.businessName || null,
      business_name_zh: next.businessNameZh || null,
      agent_name: next.agentName || null,
      greeting: next.greeting || null,
      extra_notes: next.extraNotes || null,
      voice_limit_behavior: next.voiceLimitBehavior,
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: "agent_id" },
  );
  if (error) throw error;
  return next;
}
