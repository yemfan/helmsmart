import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeUsername } from "@/lib/identity/username";
import { loadPresentationAgent, type PresentationAgent } from "@/lib/presentations/loadPresentationAgent";
import { buildFeed, isIndexable, type FeedItem } from "./feedItems";
import { resolveAgentPlan } from "@/lib/billing/resolveAgentPlan";
import { decideTracking, type TrackingDecision } from "./tracking";
import { isAnthropicConfigured } from "@/lib/anthropic";
import {
  defaultHubConfig,
  normalizeHubConfig,
  type BookingMode,
  type HubConfig,
  type PublicWorkforceType,
} from "./config";
import { publicWorkforce, type PublicWorkforceMember, type WorkforceAvailability } from "./workforce";

/**
 * Everything the public hub page needs, from a username.
 *
 * Reads go through the service-role client because `agents` is not publicly
 * readable — and that is exactly why every query here is filtered on the
 * resolved agent id and nothing else. RLS policies are OR'd, so a public-read
 * policy added later would widen any query that leaned on RLS for scoping.
 * Scoping lives in the WHERE clause, where it cannot be widened by accident.
 *
 * Never throws. A public page that 500s on a malformed handle is a worse
 * outcome than one that says the hub does not exist.
 */

export type HubStatus = "ready" | "coming_soon" | "not_found";

export type HubTestimonial = {
  id: string;
  rating: number | null;
  body: string;
  authorName: string | null;
  authorTitle: string | null;
};

export type ResolvedBooking = {
  /** What the booking CTA actually does on this hub. */
  mode: Exclude<BookingMode, "auto">;
  externalUrl: string | null;
};

export type Hub = {
  status: HubStatus;
  username: string;
  agentId: number | null;
  agent: PresentationAgent | null;
  brandName: string | null;
  bio: string | null;
  specialties: string[];
  serviceAreas: string[];
  portraitUrl: string | null;
  introVideoUrl: string | null;
  feed: FeedItem[];
  /** Whether search engines should index this. Thin hubs are noindex. */
  indexable: boolean;
  /** Which analytics tags this render should emit, if any. */
  tracking: TrackingDecision;
  /** The agent's configuration document (defaults when never saved). */
  config: HubConfig;
  /** False until the agent has saved the editor at least once. */
  hasSavedConfig: boolean;
  testimonials: HubTestimonial[];
  workforce: PublicWorkforceMember[];
  /** The receptionist's free-text knowledge, for the assistant's prompt only. Never rendered. */
  assistantKnowledge: string[];
  /** True when the AI assistant can actually answer (enabled + model configured). */
  assistantAvailable: boolean;
  booking: ResolvedBooking;
  /** Real 30-day counts for "watch my AI work", when the agent opted in and there is anything to show. */
  activity: HubActivity | null;
};

/** What the AI team actually did for this agent recently. Real rows, counted. */
export type HubActivity = {
  days: number;
  /** Inbound calls the AI receptionist handled. */
  callsHandled: number;
  /** Texts an AI assistant sent. */
  textsSent: number;
  /** Appointments booked by the AI (receptionist or hub). */
  appointmentsBooked: number;
};

const NOT_FOUND: Hub = {
  status: "not_found",
  username: "",
  agentId: null,
  agent: null,
  brandName: null,
  bio: null,
  specialties: [],
  serviceAreas: [],
  portraitUrl: null,
  introVideoUrl: null,
  feed: [],
  indexable: false,
  tracking: { metaPixelId: null, gaMeasurementId: null, pixelSuppressedBy: null },
  config: defaultHubConfig(),
  hasSavedConfig: false,
  testimonials: [],
  workforce: [],
  assistantKnowledge: [],
  assistantAvailable: false,
  booking: { mode: "request", externalUrl: null },
  activity: null,
};

/**
 * Count what the AI team did in the last 30 days. Only called when the
 * agent opted in; returns null when every count is zero, so the section
 * never shows a row of zeros to a visitor.
 */
export async function loadHubActivity(agentId: number | string, days = 30): Promise<HubActivity | null> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  try {
    const [calls, texts, appts] = await Promise.all([
      supabaseAdmin
        .from("lead_calls")
        .select("id", { count: "exact", head: true })
        .eq("agent_id", agentId as never)
        .eq("direction", "inbound")
        .gte("created_at", since),
      supabaseAdmin
        .from("sms_messages")
        .select("id", { count: "exact", head: true })
        .eq("agent_id", agentId as never)
        .eq("direction", "outbound")
        .not("assistant_type", "is", null)
        .gte("created_at", since),
      supabaseAdmin
        .from("voice_appointments")
        .select("id", { count: "exact", head: true })
        .eq("agent_id", agentId as never)
        .in("source", ["ai_receptionist", "marketing_hub"])
        .gte("created_at", since),
    ]);
    const activity: HubActivity = {
      days,
      callsHandled: calls.count ?? 0,
      textsSent: texts.count ?? 0,
      appointmentsBooked: appts.count ?? 0,
    };
    return activity.callsHandled + activity.textsSent + activity.appointmentsBooked > 0 ? activity : null;
  } catch (e) {
    console.warn("[marketing-hub] loadHubActivity failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v ?? "").trim()).filter(Boolean);
  }
  return [];
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Service areas are stored two ways. `service_areas_v2` is an array of
 * `{city, state, county}` objects (city OR county set); `service_areas` is the
 * older `"alhambra,ca"` string form. Read both rather than showing an empty
 * "areas I serve" on a hub that has the data — and never `String()` an
 * object, which rendered as "[object Object]" on the first version of this.
 */
export function serviceAreasOf(row: Record<string, unknown>): string[] {
  const v2 = row.service_areas_v2;
  if (Array.isArray(v2) && v2.length) {
    const out = v2
      .map((a) => {
        if (typeof a === "string") return a.trim();
        if (!a || typeof a !== "object") return "";
        const o = a as { city?: unknown; county?: unknown; state?: unknown };
        const place = String(o.city ?? "").trim() || (o.county ? `${String(o.county).trim()} County` : "");
        const state = String(o.state ?? "").trim().toUpperCase();
        return place ? (state ? `${titleCase(place)}, ${state}` : titleCase(place)) : "";
      })
      .filter(Boolean);
    if (out.length) return out;
  }
  return stringList(row.service_areas).map((s) =>
    s
      .split(",")
      .map((part, i) => (i === 1 ? part.trim().toUpperCase() : titleCase(part.trim())))
      .join(", "),
  );
}

/** The written bio, preferring what the agent typed over what the twin inferred. */
export function bioOf(row: Record<string, unknown>): string | null {
  const own = String(row.bio ?? "").trim();
  if (own) return own;
  const twin = row.dt_brand_profile as { bio?: unknown } | null;
  const inferred = String(twin?.bio ?? "").trim();
  return inferred || null;
}

/**
 * The agent's published social content, grouped into one card per piece.
 * Shared by the public page and the editor's featured-content picker.
 */
export async function loadHubFeed(agentId: number | string): Promise<FeedItem[]> {
  try {
    const [posts, carousels, reels] = await Promise.all([
      // The permalink lives on lead_posts, reached via published_lead_post_id.
      supabaseAdmin
        .from("scheduled_posts")
        .select(
          "id, platform, caption, image_url, subject_kind, hashtags, status, published_at, created_at, lead_posts:published_lead_post_id (external_post_url)",
        )
        .eq("agent_id", agentId as never)
        .eq("status", "posted")
        .order("published_at", { ascending: false })
        .limit(60),
      supabaseAdmin
        .from("social_carousels")
        .select("id, title, caption, hashtags, status, created_at")
        .eq("agent_id", agentId as never)
        .eq("status", "posted")
        .order("created_at", { ascending: false })
        .limit(20),
      supabaseAdmin
        .from("social_reels")
        .select("id, caption, hashtags, status, created_at")
        .eq("agent_id", agentId as never)
        .eq("status", "posted")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    const postRows = ((posts.data as Record<string, unknown>[] | null) ?? []).map((r) => {
      const joined = r.lead_posts as { external_post_url?: unknown } | null;
      return { ...r, external_post_url: joined?.external_post_url ?? null };
    });
    return buildFeed({
      posts: postRows,
      carousels: (carousels.data as Record<string, unknown>[] | null) ?? [],
      reels: (reels.data as Record<string, unknown>[] | null) ?? [],
    });
  } catch (e) {
    console.warn("[marketing-hub] loadHubFeed failed:", e instanceof Error ? e.message : e);
    return [];
  }
}

/** The agent's saved hub document, or the defaults. */
export async function loadHubSettings(
  agentId: number | string,
): Promise<{ config: HubConfig; hasSavedConfig: boolean }> {
  try {
    const { data } = await supabaseAdmin
      .from("agent_hub_settings")
      .select("config")
      .eq("agent_id", agentId as never)
      .maybeSingle();
    const raw = (data as { config?: unknown } | null)?.config;
    if (!raw || typeof raw !== "object") return { config: defaultHubConfig(), hasSavedConfig: false };
    return { config: normalizeHubConfig(raw), hasSavedConfig: true };
  } catch (e) {
    console.warn("[marketing-hub] loadHubSettings failed:", e instanceof Error ? e.message : e);
    return { config: defaultHubConfig(), hasSavedConfig: false };
  }
}

/** What the roster can back up — see workforce.ts. */
export async function loadWorkforceAvailability(agentId: number | string): Promise<WorkforceAvailability> {
  const [assistants, receptionist] = await Promise.all([
    supabaseAdmin
      .from("ai_assistants")
      .select("type, status, name, avatar_id, avatar_url")
      .eq("agent_id", agentId as never),
    supabaseAdmin
      .from("voice_receptionist_settings")
      .select("enabled, booking_enabled")
      .eq("agent_id", agentId as never)
      .maybeSingle(),
  ]);
  const map: WorkforceAvailability["assistants"] = {};
  for (const r of (assistants.data ?? []) as Record<string, unknown>[]) {
    const type = String(r.type ?? "") as PublicWorkforceType;
    map[type] = {
      status: r.status === "paused" ? "paused" : "active",
      name: String(r.name ?? "").trim(),
      avatarId: String(r.avatar_id ?? "").trim(),
      avatarUrl: typeof r.avatar_url === "string" && r.avatar_url ? r.avatar_url : null,
    };
  }
  const rec = (receptionist.data ?? {}) as { enabled?: unknown; booking_enabled?: unknown };
  return {
    assistants: map,
    receptionistEnabled: rec.enabled === true,
    bookingEnabled: rec.enabled === true && rec.booking_enabled === true,
  };
}

/** Resolve "auto" into what the page will actually do. */
export function resolveBooking(
  settings: HubConfig["leadCapture"],
  bookingEnabled: boolean,
): ResolvedBooking {
  const external = settings.externalBookingUrl;
  if (settings.bookingMode === "auto") {
    if (bookingEnabled) return { mode: "receptionist", externalUrl: null };
    if (external) return { mode: "external", externalUrl: external };
    return { mode: "request", externalUrl: null };
  }
  if (settings.bookingMode === "receptionist" && !bookingEnabled) {
    return { mode: "request", externalUrl: null };
  }
  if (settings.bookingMode === "external" && !external) {
    return { mode: "request", externalUrl: null };
  }
  return { mode: settings.bookingMode, externalUrl: settings.bookingMode === "external" ? external : null };
}

export async function loadHubByUsername(
  rawUsername: string,
  /** True when the visitor sent Global Privacy Control. Suppresses the pixel. */
  privacySignal = false,
  /** `allowUnpublished`: render a draft in full — for the OWNER's preview only. */
  opts: { allowUnpublished?: boolean } = {},
): Promise<Hub> {
  const username = normalizeUsername(rawUsername);
  if (!username) return NOT_FOUND;

  try {
    const { data, error } = await supabaseAdmin
      .from("agents")
      .select(
        "id, username, hub_published, bio, specialties, brand_name, service_areas, service_areas_v2, dt_brand_profile, dt_avatar_video_url, deleted_at",
      )
      .eq("username", username)
      .maybeSingle();

    if (error || !data) return NOT_FOUND;

    const row = data as Record<string, unknown>;
    // A deleted agent's handle stops resolving. It is deliberately NOT freed
    // for reuse here — a recycled handle would inherit the previous owner's
    // inbound links and, once mail exists, their messages.
    if (row.deleted_at) return NOT_FOUND;

    const agentId = Number(row.id);
    if (!Number.isFinite(agentId)) return NOT_FOUND;

    const published = row.hub_published === true;

    // Unpublished hubs still resolve — the agent can share the link while they
    // finish, and it holds their claim on the URL. They just have nothing on
    // them and are never indexed.
    if (!published && !opts.allowUnpublished) {
      return {
        ...NOT_FOUND,
        status: "coming_soon",
        username,
        agentId,
        brandName: String(row.brand_name ?? "").trim() || null,
      };
    }

    const [agent, plan, trackingRow, feed, settings, testimonials, availability, receptionist] =
      await Promise.all([
        loadPresentationAgent(agentId),
        resolveAgentPlan(agentId),
        supabaseAdmin
          .from("agent_tracking_config")
          .select("meta_pixel_id, ga_measurement_id")
          .eq("agent_id", agentId as never)
          .maybeSingle(),
        loadHubFeed(agentId),
        loadHubSettings(agentId),
        supabaseAdmin
          .from("testimonials")
          .select("id, rating, body, author_name, author_title")
          .eq("agent_id", agentId as never)
          .eq("is_published", true)
          .order("created_at", { ascending: false })
          .limit(6),
        loadWorkforceAvailability(agentId),
        supabaseAdmin
          .from("voice_receptionist_settings")
          .select("extra_notes")
          .eq("agent_id", agentId as never)
          .maybeSingle(),
      ]);

    const cfg = (trackingRow.data ?? {}) as {
      meta_pixel_id?: string | null;
      ga_measurement_id?: string | null;
    };

    const bio = bioOf(row);
    const { config, hasSavedConfig } = settings;

    // One extra round trip, only for agents who chose to show it.
    const activity =
      config.workforce.enabled && config.workforce.showActivity ? await loadHubActivity(agentId) : null;

    const knowledge: string[] = [];
    const recNotes = String((receptionist.data as { extra_notes?: unknown } | null)?.extra_notes ?? "").trim();
    if (recNotes) knowledge.push(recNotes);
    if (config.assistant.knowledge) knowledge.push(config.assistant.knowledge);

    const areasFromConfig = config.areas.items.map((a) => a.name);

    return {
      status: "ready",
      username,
      agentId,
      agent,
      brandName: String(row.brand_name ?? "").trim() || null,
      bio,
      specialties: stringList(row.specialties),
      serviceAreas: areasFromConfig.length ? areasFromConfig : serviceAreasOf(row),
      // The profile photo, and only that. The digital-twin portrait lives in a
      // private bucket behind a consent gate and is not for a public page.
      portraitUrl: agent.photoUrl,
      introVideoUrl: String(row.dt_avatar_video_url ?? "").trim() || null,
      feed,
      indexable: !config.seo.noindex && isIndexable({ published, bio, feedCount: feed.length }),
      tracking: decideTracking(
        { metaPixelId: cfg.meta_pixel_id ?? null, gaMeasurementId: cfg.ga_measurement_id ?? null },
        plan.tier,
        privacySignal,
      ),
      config,
      hasSavedConfig,
      testimonials: ((testimonials.data as Record<string, unknown>[] | null) ?? [])
        .map((t) => ({
          id: String(t.id),
          rating: typeof t.rating === "number" ? t.rating : null,
          body: String(t.body ?? "").trim(),
          authorName: String(t.author_name ?? "").trim() || null,
          authorTitle: String(t.author_title ?? "").trim() || null,
        }))
        .filter((t) => t.body),
      workforce: publicWorkforce(config, availability),
      assistantKnowledge: knowledge,
      assistantAvailable: config.assistant.enabled && isAnthropicConfigured(),
      booking: resolveBooking(config.leadCapture, availability.bookingEnabled),
      activity,
    };
  } catch (e) {
    console.warn("[marketing-hub] loadHubByUsername failed:", e);
    return NOT_FOUND;
  }
}

/** Resolve a handle to an agent id — for the public endpoints, which need nothing else. */
export async function resolveAgentIdByUsername(rawUsername: string): Promise<number | null> {
  const username = normalizeUsername(rawUsername);
  if (!username) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("agents")
      .select("id, deleted_at")
      .eq("username", username)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as { id: unknown; deleted_at: unknown };
    if (row.deleted_at) return null;
    const id = Number(row.id);
    return Number.isFinite(id) ? id : null;
  } catch {
    return null;
  }
}
