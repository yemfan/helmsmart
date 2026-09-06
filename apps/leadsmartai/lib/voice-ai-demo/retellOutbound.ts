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

import { loadReceptionistContext } from "@/lib/voice-agent/context";
import { buildReceptionistDynamicVariables } from "@repo/voice";
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

/**
 * A real receptionist's brain for the demo call, when one is designated.
 *
 * Without this the demo hands the agent three variables — is_demo, language,
 * caller_name — and nothing else, so it improvises a generic real-estate
 * script. A prospect evaluating voice AI hears a plausible robot rather than
 * the product: no business name, no appointment types, no knowledge base, and
 * none of the things the page promises it can do.
 *
 * VOICE_DEMO_ORG_AGENT_ID names the agent whose configuration to demo. It has
 * to be set DELIBERATELY and there is no fallback to "whichever agent we find".
 * This call goes to a stranger who typed their number into a marketing page,
 * and the context includes a real business's pricing, knowledge base and
 * appointment types — that is a customer's material, and picking an org
 * automatically would leak it. Point it at your own demo workspace.
 *
 * Every failure returns {} and lets the call proceed on the minimal variables:
 * a demo with a thin script beats no demo, and the reason is logged.
 */
async function demoOrgVariables(): Promise<Record<string, string>> {
  const agentId = (process.env.VOICE_DEMO_ORG_AGENT_ID || "").trim();
  if (!agentId) return {};
  try {
    const ctx = await loadReceptionistContext(agentId);
    // Null when that agent's receptionist is switched off — its config is not
    // something to demo, so fall back rather than half-load it.
    if (!ctx) {
      console.warn("[voice-ai-demo] VOICE_DEMO_ORG_AGENT_ID has no enabled receptionist:", agentId);
      return {};
    }
    return buildReceptionistDynamicVariables(ctx);
  } catch (e) {
    console.warn("[voice-ai-demo] could not load demo org context:", e);
    return {};
  }
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
        // Org context first, demo flags second: is_demo, language and
        // caller_name describe THIS call and must win. They do not collide
        // today (the org set has caller_number, not caller_name), but the
        // order says which is authoritative if that ever changes.
        retell_llm_dynamic_variables: {
          ...(await demoOrgVariables()),
          ...demoDynamicVariables({
            language: args.language,
            prospectName: args.prospectName,
          }),
        },
      }),
    });

    const body = (await res.json().catch(() => ({}))) as {
      call_id?: string;
      error_message?: string;
      message?: string;
    };

    if (!res.ok) {
      const reason = body.error_message || body.message || `HTTP ${res.status}`;
      /*
       * Say WHAT was not found.
       *
       * Retell answers a create-call it cannot fulfil with a bare "Not Found",
       * and this line used to log exactly that. It is the least useful true
       * sentence available: a 404 here means the from-number is not registered
       * on the account this key opens, OR the agent id does not exist on it —
       * two different fixes, in two different places, and the log picked
       * neither. A demo silently fell back to the legacy Twilio engine and the
       * only clue was two words.
       *
       * The number and the agent id are ours and safe to log; the API key is
       * not logged. On a 404 specifically, name both inputs so the next reader
       * can check them against the Retell dashboard without another round trip.
       */
      const detail =
        res.status === 404
          ? ` (from_number=${fromNumber}, override_agent_id=${agentId} — one of these is not on the account this RETELL_API_KEY opens)`
          : "";
      console.error(`[voice-ai-demo] Retell refused the call: HTTP ${res.status} ${reason}${detail}`);
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
