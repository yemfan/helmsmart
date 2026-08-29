import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeUsername } from "@/lib/identity/username";
import { loadPresentationAgent, type PresentationAgent } from "@/lib/presentations/loadPresentationAgent";
import { buildFeed, isIndexable, type FeedItem } from "./feedItems";

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
};

/** Storage paths are stored bare; public URLs are absolute. Only build one for a path. */
function publicStorageUrl(path: string | null): string | null {
  const p = (path ?? "").trim();
  if (!p) return null;
  if (/^https?:\/\//i.test(p)) return p;
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  return base ? `${base}/storage/v1/object/public/${p.replace(/^\/+/, "")}` : null;
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v ?? "").trim()).filter(Boolean);
  }
  return [];
}

/**
 * Service areas are stored two ways — `service_areas_v2` superseded
 * `service_areas` and most rows still only have the old one. Read both rather
 * than showing an empty "areas I serve" on a hub that has the data.
 */
function serviceAreasOf(row: Record<string, unknown>): string[] {
  const v2 = stringList(row.service_areas_v2);
  if (v2.length) return v2;
  return stringList(row.service_areas).map((s) =>
    // Stored as "alhambra,ca" — presentable as "Alhambra, CA".
    s
      .split(",")
      .map((part, i) =>
        i === 1 ? part.trim().toUpperCase() : part.trim().replace(/\b\w/g, (c) => c.toUpperCase()),
      )
      .join(", "),
  );
}

/** The written bio, preferring what the agent typed over what the twin inferred. */
function bioOf(row: Record<string, unknown>): string | null {
  const own = String(row.bio ?? "").trim();
  if (own) return own;
  const twin = row.dt_brand_profile as { bio?: unknown } | null;
  const inferred = String(twin?.bio ?? "").trim();
  return inferred || null;
}

export async function loadHubByUsername(rawUsername: string): Promise<Hub> {
  const username = normalizeUsername(rawUsername);
  if (!username) return NOT_FOUND;

  try {
    const { data, error } = await supabaseAdmin
      .from("agents")
      .select(
        "id, username, hub_published, bio, specialties, brand_name, service_areas, service_areas_v2, dt_brand_profile, dt_portrait_path, dt_avatar_video_url, deleted_at",
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
    if (!published) {
      return {
        ...NOT_FOUND,
        status: "coming_soon",
        username,
        agentId,
        brandName: String(row.brand_name ?? "").trim() || null,
      };
    }

    const [agent, posts, carousels, reels] = await Promise.all([
      loadPresentationAgent(agentId),
      supabaseAdmin
        .from("scheduled_posts")
        .select("id, platform, caption, image_url, status, published_at, created_at")
        .eq("agent_id", agentId as never)
        .eq("status", "posted")
        .order("published_at", { ascending: false })
        .limit(40),
      supabaseAdmin
        .from("social_carousels")
        .select("id, title, caption, status, created_at")
        .eq("agent_id", agentId as never)
        .eq("status", "posted")
        .order("created_at", { ascending: false })
        .limit(20),
      supabaseAdmin
        .from("social_reels")
        .select("id, caption, status, created_at")
        .eq("agent_id", agentId as never)
        .eq("status", "posted")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const feed = buildFeed({
      posts: (posts.data as Record<string, unknown>[] | null) ?? [],
      carousels: (carousels.data as Record<string, unknown>[] | null) ?? [],
      reels: (reels.data as Record<string, unknown>[] | null) ?? [],
    });

    const bio = bioOf(row);

    return {
      status: "ready",
      username,
      agentId,
      agent,
      brandName: String(row.brand_name ?? "").trim() || null,
      bio,
      specialties: stringList(row.specialties),
      serviceAreas: serviceAreasOf(row),
      portraitUrl: publicStorageUrl(String(row.dt_portrait_path ?? "")) ?? agent.photoUrl,
      introVideoUrl: String(row.dt_avatar_video_url ?? "").trim() || null,
      feed,
      indexable: isIndexable({ published, bio, feedCount: feed.length }),
    };
  } catch (e) {
    console.warn("[marketing-hub] loadHubByUsername failed:", e);
    return NOT_FOUND;
  }
}

/** Resolve a handle to an agent id — for the lead endpoint, which needs nothing else. */
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
