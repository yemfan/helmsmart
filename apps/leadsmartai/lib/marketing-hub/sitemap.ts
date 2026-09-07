import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeHubConfig } from "./config";
import { MIN_ITEMS_TO_INDEX } from "./feedItems";
import { bioOf, serviceAreasOf } from "./loadHub";
import { hubSitemapPaths, type HubSitemapEntry } from "./sitemapPaths";

export type { HubSitemapEntry } from "./sitemapPaths";

/**
 * Agent hubs in the site's sitemap.
 *
 * Only hubs that would be indexed anyway are listed: published, with a bio,
 * enough published posts to clear the thin-content bar, and not marked
 * noindex by the agent. For those, the home page, each subpage that exists
 * in the pages layout, and each market-area page. Listing a noindex page
 * would be harmless but sloppy; listing an empty page would be a 404.
 *
 * Bounded: the first 1,000 published hubs. Guarded: any failure yields no
 * entries rather than a broken sitemap.
 */
export async function listHubSitemapEntries(): Promise<HubSitemapEntry[]> {
  try {
    const { data: agents } = await supabaseAdmin
      .from("agents")
      .select("id, username, bio, dt_brand_profile, service_areas, service_areas_v2")
      .eq("hub_published", true)
      .not("username", "is", null)
      .is("deleted_at", null)
      .limit(1000);
    const rows = (agents as Record<string, unknown>[] | null) ?? [];
    if (!rows.length) return [];
    const ids = rows.map((r) => Number(r.id)).filter(Number.isFinite);

    const [settings, posts] = await Promise.all([
      supabaseAdmin.from("agent_hub_settings").select("agent_id, config").in("agent_id", ids as never[]),
      supabaseAdmin
        .from("scheduled_posts")
        .select("agent_id")
        .in("agent_id", ids as never[])
        .eq("status", "posted")
        .limit(20000),
    ]);
    const configById = new Map<number, unknown>();
    for (const s of (settings.data as { agent_id: unknown; config: unknown }[] | null) ?? []) {
      configById.set(Number(s.agent_id), s.config);
    }
    const postCount = new Map<number, number>();
    for (const p of (posts.data as { agent_id: unknown }[] | null) ?? []) {
      const id = Number(p.agent_id);
      postCount.set(id, (postCount.get(id) ?? 0) + 1);
    }

    const out: HubSitemapEntry[] = [];
    for (const r of rows) {
      const id = Number(r.id);
      const username = String(r.username ?? "").trim();
      if (!username) continue;
      const feedCount = postCount.get(id) ?? 0;
      // Cheap pre-check before touching the config: a hub below the post bar
      // cannot be indexable whatever else it has.
      if (feedCount < MIN_ITEMS_TO_INDEX) continue;
      const raw = configById.get(id);
      out.push(
        ...hubSitemapPaths({
          username,
          config: normalizeHubConfig(raw ?? {}),
          hasSavedConfig: raw != null,
          serviceAreas: serviceAreasOf(r),
          // Same rule as the page: the typed bio, else the twin's.
          bio: bioOf(r),
          feedCount,
        }),
      );
    }
    return out;
  } catch (e) {
    console.warn("[marketing-hub] sitemap entries failed:", e instanceof Error ? e.message : e);
    return [];
  }
}
