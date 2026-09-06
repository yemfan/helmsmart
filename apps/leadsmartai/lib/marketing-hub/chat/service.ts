import "server-only";

import { cachedSystem } from "@leadsmart/shared/utils/promptCache";
import { getAnthropicClient } from "@/lib/anthropic";
import { BOSS_AGENT_MODEL } from "@/lib/ai/config";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { actionHref, servicesToRender, toolKeysToRender } from "../config";
import { captureHubLead, HUB_LEAD_INTENTS, type HubLeadIntent } from "../leads";
import type { Hub } from "../loadHub";
import { hubToolHref, resolveHubTools } from "../tools";
import { readCookieFromHeader, SESSION_COOKIE, VISITOR_COOKIE } from "../visitor";
import {
  buildAssistantSystemPrompt,
  CAPTURE_LEAD_TOOL,
  CAPTURE_LEAD_TOOL_NAME,
  type AssistantPromptContext,
} from "./prompt";

/**
 * One turn of a visitor's conversation with the agent's AI assistant.
 *
 * A single `messages.create` with one tool, at most two rounds: the model
 * answers, or it calls `capture_lead`, we save what it learned, and it
 * answers with that result in hand. No agent loop — a visitor question is a
 * question, not a mission, and the Boss engine's tool set (send message,
 * publish post…) has no business anywhere near a stranger.
 *
 * The transcript lives in `hub_conversations`, one row per (agent, browser
 * conversation). The client holds only the row id; the row is checked
 * against the agent on every turn so an id from one hub cannot be replayed
 * on another.
 */

export const MAX_MESSAGES_PER_CONVERSATION = 40;
/** Turns sent to the model — the rest is history the visitor can scroll. */
const MODEL_HISTORY = 16;
const MAX_TOKENS = 700;

export type ChatMessage = { role: "user" | "assistant"; content: string; at: string };

export type LeadState = {
  name?: string;
  email?: string;
  phone?: string;
  intent?: HubLeadIntent;
  timeline?: string;
  location?: string;
  price_range?: string;
  property_address?: string;
  notes?: string;
  sms_consent?: boolean;
  /** Set once captureHubLead has succeeded. */
  captured?: boolean;
};

export type ChatTurnResult =
  | { ok: true; conversationId: string; reply: string; leadCaptured: boolean; limitReached: boolean }
  | { ok: false; error: "unavailable" | "limit" | "failed" };

type Row = {
  id: string;
  agent_id: number;
  messages: ChatMessage[];
  lead_state: LeadState;
  message_count: number;
  contact_id: string | null;
};

function labelForService(preset: string, name: string | null): string {
  if (name) return name;
  const names: Record<string, string> = {
    buy: "Buy a home",
    sell: "Sell a home",
    invest: "Invest in real estate",
    relocate: "Relocate",
    new_construction: "New construction",
    analysis: "Real estate analysis",
  };
  return names[preset] ?? preset;
}

function labelForTool(key: string): string {
  const names: Record<string, string> = {
    home_value: "Home value estimate",
    find_home: "Home search",
    mortgage: "Mortgage calculator",
    affordability: "Affordability calculator",
    down_payment: "Down payment calculator",
    closing_cost: "Closing cost estimator",
    rent_vs_buy: "Rent vs buy calculator",
    refinance: "Refinance calculator",
    cash_flow: "Cash flow calculator",
    cap_rate_roi: "Cap rate & ROI calculator",
    roi: "ROI calculator",
    investment_analyzer: "Investment property analyzer",
  };
  return names[key] ?? key;
}

/** Everything the prompt needs, from the loaded hub. */
export function promptContextFor(hub: Hub, locale: string, siteBase: string): AssistantPromptContext {
  const cfg = hub.config;
  const name = hub.agent?.name?.trim() || hub.brandName || `@${hub.username}`;
  const ctx = {
    username: hub.username,
    phone: cfg.profile.showPhone ? hub.agent?.phone ?? null : null,
    email: cfg.profile.showEmail ? hub.agent?.email ?? null : null,
    externalBookingUrl: hub.booking.externalUrl,
  };
  const abs = (href: string | null) => (href && href.startsWith("/") ? `${siteBase}${href}` : href);
  const bookingHref =
    hub.booking.mode === "off" || !cfg.assistant.offerBooking
      ? null
      : abs(actionHref({ kind: "book", url: null }, ctx));

  return {
    agentName: name,
    brandName: hub.brandName,
    brokerage: hub.agent?.brokerage ?? null,
    title: cfg.profile.title,
    location: cfg.profile.location,
    bio: hub.bio,
    specialties: hub.specialties,
    areas: hub.serviceAreas,
    languages: cfg.profile.languages,
    yearsExperience: cfg.profile.yearsExperience,
    services: servicesToRender(cfg, hub.hasSavedConfig).map((s) => ({
      name: labelForService(s.preset, s.name),
      description: s.description,
    })),
    tools: resolveHubTools(toolKeysToRender(cfg, hub.hasSavedConfig)).map((t) => ({
      name: labelForTool(t.key),
      href: abs(hubToolHref(t, hub.username)) as string,
    })),
    phone: cfg.assistant.offerPhone ? ctx.phone : null,
    email: ctx.email,
    bookingHref,
    homeValueHref: `${siteBase}/@${hub.username}/home-value`,
    findHomeHref: `${siteBase}/homes?agent=${encodeURIComponent(hub.username)}`,
    knowledge: hub.assistantKnowledge,
    tone: cfg.assistant.tone,
    captureLeads: cfg.assistant.captureLeads,
    locale,
  };
}

async function loadOrCreate(args: {
  agentId: number;
  conversationId: string | null;
  cookieHeader: string | null;
  locale: string;
}): Promise<Row | null> {
  const { agentId } = args;
  if (args.conversationId) {
    const { data } = await supabaseAdmin
      .from("hub_conversations")
      .select("id, agent_id, messages, lead_state, message_count, contact_id")
      .eq("id", args.conversationId as never)
      .eq("agent_id", agentId as never)
      .maybeSingle();
    if (data) {
      const r = data as Record<string, unknown>;
      return {
        id: String(r.id),
        agent_id: Number(r.agent_id),
        messages: Array.isArray(r.messages) ? (r.messages as ChatMessage[]) : [],
        lead_state: (r.lead_state && typeof r.lead_state === "object" ? r.lead_state : {}) as LeadState,
        message_count: Number(r.message_count ?? 0),
        contact_id: (r.contact_id as string | null) ?? null,
      };
    }
    // Unknown or someone else's id: start fresh rather than fail the visitor.
  }
  const { data, error } = await supabaseAdmin
    .from("hub_conversations")
    .insert({
      agent_id: agentId,
      visitor_id: readCookieFromHeader(args.cookieHeader, VISITOR_COOKIE),
      session_id: readCookieFromHeader(args.cookieHeader, SESSION_COOKIE),
      locale: args.locale,
    } as never)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    console.error("[hub.chat] create conversation failed:", error?.message);
    return null;
  }
  return {
    id: String((data as { id: string }).id),
    agent_id: agentId,
    messages: [],
    lead_state: {},
    message_count: 0,
    contact_id: null,
  };
}

function mergeLeadState(prev: LeadState, input: Record<string, unknown>): LeadState {
  const next: LeadState = { ...prev };
  const s = (k: string, max = 200) => {
    const v = input[k];
    return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;
  };
  const name = s("name", 120);
  const email = s("email", 200);
  const phone = s("phone", 40);
  if (name) next.name = name;
  if (email && /\S+@\S+\.\S+/.test(email)) next.email = email.toLowerCase();
  if (phone && phone.replace(/\D/g, "").length >= 7) next.phone = phone;
  const intent = s("intent", 20);
  if (intent && (HUB_LEAD_INTENTS as readonly string[]).includes(intent)) next.intent = intent as HubLeadIntent;
  for (const k of ["timeline", "location", "price_range", "property_address", "notes"] as const) {
    const v = s(k, k === "notes" ? 600 : 200);
    if (v) next[k] = v;
  }
  if (input.sms_consent === true) next.sms_consent = true;
  return next;
}

export async function runHubChatTurn(args: {
  hub: Hub;
  message: string;
  conversationId: string | null;
  cookieHeader: string | null;
  requestMeta: { ipAddress: string | null; userAgent: string | null };
  locale: string;
  siteBase: string;
  utmSource?: string | null;
  utmCampaign?: string | null;
  /** Called with each text fragment as the model produces it. */
  onDelta?: (text: string) => void;
}): Promise<ChatTurnResult> {
  const { hub } = args;
  if (!hub.assistantAvailable || hub.agentId === null) return { ok: false, error: "unavailable" };
  const agentId = hub.agentId;

  const message = args.message.trim().slice(0, 2000);
  if (!message) return { ok: false, error: "failed" };

  const row = await loadOrCreate({
    agentId,
    conversationId: args.conversationId,
    cookieHeader: args.cookieHeader,
    locale: args.locale,
  });
  if (!row) return { ok: false, error: "failed" };
  if (row.message_count >= MAX_MESSAGES_PER_CONVERSATION) return { ok: false, error: "limit" };

  const system = buildAssistantSystemPrompt(promptContextFor(hub, args.locale, args.siteBase));
  const history = row.messages.slice(-MODEL_HISTORY).map((m) => ({ role: m.role, content: m.content }));
  const modelMessages: Array<{ role: "user" | "assistant"; content: unknown }> = [
    ...history,
    { role: "user", content: message },
  ];

  let leadState = row.lead_state;
  let leadCaptured = Boolean(leadState.captured);
  let reply = "";

  try {
    const client = getAnthropicClient();
    for (let round = 0; round < 2; round++) {
      // Streamed so the visitor sees words as they arrive. Text before a
      // tool call and text after it are one answer to the reader, so the
      // two rounds are joined rather than replaced.
      const stream = client.messages.stream({
        model: BOSS_AGENT_MODEL,
        max_tokens: MAX_TOKENS,
        system: cachedSystem(system) as never,
        messages: modelMessages as never,
        tools: [CAPTURE_LEAD_TOOL] as never,
      });
      if (args.onDelta) {
        let first = true;
        stream.on("text", (delta) => {
          if (first && reply) args.onDelta?.("\n\n");
          first = false;
          args.onDelta?.(delta);
        });
      }
      const res = await stream.finalMessage();

      const text = res.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { text: string }).text)
        .join("\n")
        .trim();
      const toolUses = res.content
        .filter((b) => b.type === "tool_use")
        .map((b) => b as unknown as { id: string; name: string; input: Record<string, unknown> });

      if (text) reply = reply ? `${reply}\n\n${text}` : text;
      if (!toolUses.length || round === 1) break;

      // Record what the model learned, save the lead when there is enough,
      // and let the model finish its sentence with the outcome in hand.
      modelMessages.push({ role: "assistant", content: res.content });
      const results: unknown[] = [];
      for (const use of toolUses) {
        let outcome = "Noted.";
        if (use.name === CAPTURE_LEAD_TOOL_NAME) {
          leadState = mergeLeadState(leadState, use.input ?? {});
          const ready = Boolean(leadState.name && (leadState.email || leadState.phone));
          if (ready) {
            const saved = await captureHubLead({
              agentId,
              username: hub.username,
              input: {
                name: leadState.name ?? "",
                email: leadState.email ?? "",
                phone: leadState.phone ?? "",
                message: leadState.notes ?? "",
                smsConsent: leadState.sms_consent === true,
                intent: leadState.intent ?? null,
                timeline: leadState.timeline ?? null,
                location: leadState.location ?? null,
                priceRange: leadState.price_range ?? null,
                propertyAddress: leadState.property_address ?? null,
                channel: "ai_chat",
                utmSource: args.utmSource ?? null,
                utmCampaign: args.utmCampaign ?? null,
                conversationId: row.id,
                locale: args.locale,
              },
              cookieHeader: args.cookieHeader,
              requestMeta: args.requestMeta,
              settings: hub.config.leadCapture,
            });
            if (saved.ok) {
              leadState.captured = true;
              leadCaptured = true;
              outcome = "Lead saved. The agent has been notified and will follow up.";
            } else {
              outcome = "Could not save right now; tell the visitor the agent's direct contact options.";
            }
          } else {
            const missing = !leadState.name ? "a name" : "an email or phone number";
            outcome = `Details noted, not yet saved: still need ${missing}.`;
          }
        }
        results.push({ type: "tool_result", tool_use_id: use.id, content: outcome });
      }
      modelMessages.push({ role: "user", content: results });
    }
  } catch (e) {
    console.error("[hub.chat] model call failed:", e instanceof Error ? e.message : e);
    return { ok: false, error: "failed" };
  }

  if (!reply) {
    reply = "I'm here — could you say a bit more about what you're looking for?";
    args.onDelta?.(reply);
  }

  const now = new Date().toISOString();
  const messages: ChatMessage[] = [
    ...row.messages,
    { role: "user", content: message, at: now },
    { role: "assistant", content: reply, at: now },
  ];
  const count = row.message_count + 2;

  void supabaseAdmin
    .from("hub_conversations")
    .update({
      messages,
      lead_state: leadState,
      message_count: count,
      updated_at: now,
    } as never)
    .eq("id", row.id as never)
    .eq("agent_id", agentId as never)
    .then(({ error }) => {
      if (error) console.warn("[hub.chat] persist:", error.message);
    });

  return {
    ok: true,
    conversationId: row.id,
    reply,
    leadCaptured,
    limitReached: count >= MAX_MESSAGES_PER_CONVERSATION,
  };
}
