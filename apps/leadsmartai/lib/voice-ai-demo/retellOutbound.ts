import "server-only";

/**
 * Place the voice-AI demo call through Retell — the same stack the production
 * receptionist runs on.
 *
 * Prospects were previously called by the older Twilio Say/Gather loop, then
 * met Emma later and found a different product. This closes that gap: the demo
 * call IS the receptionist.
 *
 * Falls back to the legacy Twilio path when Retell is not configured, rather
 * than dropping the demo entirely — but says loudly which variable is missing,
 * because a silent fallback is how the mismatch survived this long.
 */

import {
  demoDynamicVariables,
  envVarFor,
  resolveRetellDemoConfig,
  type DemoLanguage,
  type RetellDemoEnv,
} from "./retellAgent";

const RETELL_CREATE_CALL_URL = "https://api.retellai.com/v2/create-phone-call";

export type RetellDemoResult =
  | { ok: true; callId: string }
  | { ok: false; code: "not_configured"; reason: string }
  | { ok: false; code: "retell_error"; reason: string };

function envFromProcess(): RetellDemoEnv {
  return {
    apiKey: process.env.RETELL_API_KEY,
    fromNumber: process.env.RETELL_DEMO_FROM_NUMBER,
    inboundAgentId: process.env.RETELL_INBOUND_AGENT_ID,
    agentIdEn: process.env.RETELL_DEMO_AGENT_ID_EN,
    agentIdZh: process.env.RETELL_DEMO_AGENT_ID_ZH,
  };
}

/** Is Retell set up well enough to place this call? Cheap, no network. */
export function isRetellDemoConfigured(language: DemoLanguage): boolean {
  return resolveRetellDemoConfig(envFromProcess(), language).ok;
}

export async function placeRetellDemoCall(args: {
  toPhoneE164: string;
  language: DemoLanguage;
  prospectName?: string | null;
}): Promise<RetellDemoResult> {
  const resolved = resolveRetellDemoConfig(envFromProcess(), args.language);
  if (!resolved.ok) {
    const reason = `${resolved.problem} — set ${envVarFor(resolved.problem)}`;
    console.warn("[voice-ai-demo] Retell not configured, falling back:", reason);
    return { ok: false, code: "not_configured", reason };
  }

  const { apiKey, fromNumber, agentId } = resolved.config;

  try {
    const res = await fetch(RETELL_CREATE_CALL_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from_number: fromNumber,
        to_number: args.toPhoneE164,
        override_agent_id: agentId,
        retell_llm_dynamic_variables: demoDynamicVariables({
          language: args.language,
          prospectName: args.prospectName,
        }),
      }),
    });

    const body = (await res.json().catch(() => ({}))) as {
      call_id?: string;
      error_message?: string;
      message?: string;
    };

    if (!res.ok) {
      const reason = body.error_message || body.message || `HTTP ${res.status}`;
      console.error("[voice-ai-demo] Retell refused the call:", reason);
      return { ok: false, code: "retell_error", reason };
    }

    const callId = String(body.call_id ?? "").trim();
    if (!callId) {
      return { ok: false, code: "retell_error", reason: "no call_id returned" };
    }
    return { ok: true, callId };
  } catch (e) {
    const reason = e instanceof Error ? e.message : "request failed";
    console.error("[voice-ai-demo] Retell request threw:", reason);
    return { ok: false, code: "retell_error", reason };
  }
}
