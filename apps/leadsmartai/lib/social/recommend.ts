import "server-only";

import { supabaseServer } from "@/lib/supabaseServer";
import { getSiteUrl } from "@/lib/siteUrl";
import { getLatestDigest } from "@/lib/newsletter/db";
import {
  DEFAULT_DIGEST_CATEGORY,
  type DigestItem,
} from "@/lib/newsletter/generateDigest";
import { loadPresentationAgent } from "@/lib/presentations/loadPresentationAgent";
import { renderCardPng, type BrandKit } from "@/lib/social/renderCard";
import { agentHasSocialCustomization } from "@/lib/social/customization";
import { getAgentAiSettings } from "@/lib/agent-ai/settings";

/**
 * Weekly Marketing Assistant social recommender (Phase 1).
 *
 * Once a week (via cron, or on demand from the dashboard), each agent gets a
 * small queue of social-post DRAFTS in social_post_recommendations:
 *   - 1 TIMELY post composed from the latest newsletter digest's top item,
 *     linking to that issue.
 *   - 2 EVERGREEN posts drawn from the shared social_content_library, avoiding
 *     what the agent was recommended recently.
 *
 * Captions are composed DETERMINISTICALLY from stored fields (digest headline /
 * library hook+body+cta) — no per-post AI call, so this stays cheap. The agent's
 * autopilot MODE for (marketing_assistant, social) in boss_autopilot_settings
 * decides the initial status: 'auto' → 'approved' (autopilot fills the queue),
 * anything else → 'suggested' (approval mode, awaiting the agent's OK).
 *
 * All writes/reads here go through the service-role client (supabaseServer):
 * the library + newsletter tables are RLS-deny, and the cron writes across
 * agents. Dashboard-scoped mutations (approve/dismiss) use
 * updateRecommendationStatus, which is agent-scoped.
 */

export type SocialMode = "ask" | "auto";

/** The Monday (00:00 UTC) of the current week as YYYY-MM-DD. Matches the
 *  newsletter cron's week_of so timely links line up with a real issue. */
export function currentWeekOf(now: Date = new Date()): string {
  const day = now.getUTCDay(); // 0=Sun … 6=Sat
  const diff = (day + 6) % 7; // days since Monday
  const monday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff),
  );
  return monday.toISOString().slice(0, 10);
}

export type SocialRecommendation = {
  id: string;
  agent_id: string;
  week_of: string;
  source_type: "evergreen" | "timely";
  library_id: string | null;
  timely_ref: string | null;
  caption: string;
  hashtags: string[];
  link: string | null;
  image_prompt: string | null;
  /** Stored branded-card (or custom) image URL in the social-images bucket.
   *  NULL falls back to the on-the-fly /api/social/card/[id] route. */
  image_url: string | null;
  /** How image_url was produced: 'branded_card' | 'custom' | 'stock' | 'ai'. */
  image_source: string | null;
  status: "suggested" | "approved" | "dismissed" | "copied" | "scheduled";
  created_at: string;
};

/** A connected social account, as resolved for scheduling. */
export type ConnectedSocialAccount = {
  id: string;
  platform: string; // 'meta' | 'linkedin'
  ig_business_user_id: string | null;
};

/**
 * Result of scheduling one recommendation into scheduled_posts. `scheduledCount`
 * is the number of scheduled_posts rows created (one per target account).
 */
export type ScheduleResult = {
  scheduledCount: number;
  scheduledFor: string;
};

const REC_SELECT =
  "id, agent_id, week_of, source_type, library_id, timely_ref, caption, hashtags, link, image_prompt, image_url, image_source, status, created_at";

/**
 * Service-role read of ONE recommendation by id, with the evergreen library
 * row's category joined in (used to label the branded tip card). No agent
 * scope: this powers the PUBLIC branded-image route (/api/social/card/[id]),
 * whose image the agent shares with anyone — same share-by-link posture as the
 * public market-report / CMA pages. Returns null when the row is missing.
 */
export async function getRecommendationForCard(
  recId: string,
): Promise<(SocialRecommendation & { libraryCategory: string | null }) | null> {
  const { data, error } = await supabaseServer
    .from("social_post_recommendations")
    .select(REC_SELECT)
    .eq("id", recId)
    .maybeSingle();
  if (error || !data) return null;
  const rec = normalizeRec(data as SocialRecommendation);

  let libraryCategory: string | null = null;
  if (rec.source_type === "evergreen" && rec.library_id) {
    const { data: lib } = await supabaseServer
      .from("social_content_library")
      .select("category")
      .eq("id", rec.library_id)
      .maybeSingle();
    const cat = (lib as { category?: string } | null)?.category;
    libraryCategory = typeof cat === "string" && cat.trim() ? cat.trim() : null;
  }
  return { ...rec, libraryCategory };
}

type LibraryRow = {
  id: string;
  category: string;
  title: string;
  hook: string;
  body: string;
  hashtags: string[] | null;
  cta: string | null;
  image_prompt: string | null;
};

/** The agent's autopilot mode for (marketing_assistant, social); default 'ask'. */
export async function getSocialMode(agentId: string): Promise<SocialMode> {
  try {
    const { data } = await supabaseServer
      .from("boss_autopilot_settings")
      .select("mode")
      .eq("agent_id", agentId)
      .eq("assignee", "marketing_assistant")
      .eq("channel", "social")
      .maybeSingle();
    const mode = (data as { mode?: string } | null)?.mode;
    return mode === "auto" ? "auto" : "ask";
  } catch {
    return "ask";
  }
}

/** Upsert the agent's social autopilot mode. */
export async function setSocialMode(agentId: string, mode: SocialMode): Promise<void> {
  await supabaseServer.from("boss_autopilot_settings").upsert(
    {
      agent_id: agentId,
      assignee: "marketing_assistant",
      channel: "social",
      mode,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "agent_id,assignee,channel" },
  );
}

/** This agent's recommendations for a week, newest first. Service-role read. */
export async function listRecommendations(
  agentId: string,
  weekOf: string,
): Promise<SocialRecommendation[]> {
  const { data, error } = await supabaseServer
    .from("social_post_recommendations")
    .select(REC_SELECT)
    .eq("agent_id", agentId)
    .eq("week_of", weekOf)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as SocialRecommendation[]).map(normalizeRec);
}

/**
 * Approve / dismiss / mark-copied a single recommendation. Agent-scoped: the
 * update is constrained to rows the agent owns, so one agent can't touch
 * another's queue even through the service-role client.
 */
export async function updateRecommendationStatus(
  agentId: string,
  recId: string,
  status: SocialRecommendation["status"],
): Promise<boolean> {
  const { data, error } = await supabaseServer
    .from("social_post_recommendations")
    .update({ status })
    .eq("id", recId)
    .eq("agent_id", agentId)
    .select("id")
    .maybeSingle();
  if (error || !data) return false;
  return true;
}

// ── publish glue: recommendations → scheduled_posts ─────────────────────────

/**
 * The agent's CONNECTED social accounts (status='connected'), the minimal shape
 * scheduling needs. Service-role read; caller is responsible for agent scoping
 * by passing the right agentId.
 */
export async function getConnectedSocialAccounts(
  agentId: string,
): Promise<ConnectedSocialAccount[]> {
  const { data, error } = await supabaseServer
    .from("social_accounts")
    .select("id, platform, ig_business_user_id")
    .eq("agent_id", agentId)
    .eq("status", "connected");
  if (error || !data) return [];
  return (data as ConnectedSocialAccount[]).map((a) => ({
    id: String(a.id),
    platform: String(a.platform),
    ig_business_user_id: a.ig_business_user_id ?? null,
  }));
}

/**
 * Derive the scheduled_posts.platform value from a connected account. MVP rule
 * (documented + intentionally simple):
 *   - 'linkedin' account → 'linkedin'
 *   - 'meta' account     → 'facebook' (Page feed post; captions + a public
 *                           image both work on FB, and it doesn't require the
 *                           IG-business linkage that 'instagram' does).
 * A meta account with an IG business id COULD post to instagram too, but we keep
 * one target per account for the MVP and pick the always-available FB feed.
 */
function platformForAccount(acct: ConnectedSocialAccount): PublishTargetPlatform {
  if (acct.platform === "linkedin") return "linkedin";
  return "facebook";
}

type PublishTargetPlatform = "facebook" | "instagram" | "linkedin";

/**
 * Queue ONE recommendation into scheduled_posts — one row per target account —
 * carrying the rec's branded-card `image_url` directly (it lives in the
 * social-images bucket, not media_library). Shared by the schedule endpoint and
 * autopilot auto-scheduling so the insert logic lives in one place.
 *
 * Idempotent-ish: if the rec is already 'scheduled', returns 0 without inserting
 * again (the caller checks status; this is a second guard). Best-effort marks the
 * rec 'scheduled' after inserting.
 *
 * Uses the service-role client (supabaseServer) — the SAME client the existing
 * quick-post scheduler writes scheduled_posts with — because scheduled_posts is
 * a business table the session client can't write directly. Agent scoping is the
 * caller's responsibility (rec + accounts must belong to `agentId`).
 */
export async function scheduleRecommendation(
  agentId: string,
  rec: Pick<SocialRecommendation, "id" | "caption" | "hashtags" | "image_url" | "status">,
  accounts: ConnectedSocialAccount[],
  scheduledForIso?: string,
): Promise<ScheduleResult> {
  const scheduledFor = scheduledForIso ?? new Date().toISOString();
  if (accounts.length === 0) return { scheduledCount: 0, scheduledFor };
  if (rec.status === "scheduled") return { scheduledCount: 0, scheduledFor };

  // Caption = rec caption + a hashtag line (mirrors the WeeklySocialPosts copy
  // action). publishPost also inlines hashtags for IG/LinkedIn, but building the
  // full body here keeps FB (which is NOT inlined downstream) consistent.
  const tags = Array.isArray(rec.hashtags) && rec.hashtags.length > 0
    ? rec.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")
    : "";
  const caption = [rec.caption.trim(), tags].filter(Boolean).join("\n\n");

  const rows = accounts.map((acct) => ({
    agent_id: agentId,
    social_account_id: acct.id,
    platform: platformForAccount(acct),
    caption,
    hashtags: Array.isArray(rec.hashtags) ? rec.hashtags : [],
    media_library_id: null,
    image_url: rec.image_url ?? null,
    trigger_kind: "marketing_assistant_social",
    subject_kind: "social_recommendation",
    subject_ref_id: rec.id,
    status: "scheduled",
    scheduled_for: scheduledFor,
  }));

  const { data, error } = await supabaseServer
    .from("scheduled_posts")
    .insert(rows as Record<string, unknown>[])
    .select("id");
  if (error) {
    console.warn(
      `[social] scheduleRecommendation insert failed for rec ${rec.id} (agent ${agentId}):`,
      error.message,
    );
    return { scheduledCount: 0, scheduledFor };
  }

  const scheduledCount = Array.isArray(data) ? data.length : 0;

  if (scheduledCount > 0) {
    // Mark the rec scheduled — agent-scoped so it never touches another queue.
    await supabaseServer
      .from("social_post_recommendations")
      .update({ status: "scheduled" })
      .eq("id", rec.id)
      .eq("agent_id", agentId);
  }

  return { scheduledCount, scheduledFor };
}

/**
 * Build this agent's weekly recommendations (idempotent per (agent, week)).
 * Returns the number of rows inserted (0 when nothing to add or already done).
 */
export async function generateWeeklyRecommendations(
  agentId: string,
  weekOf: string,
): Promise<{ count: number }> {
  // Idempotent: if this agent already has any rec for this week, skip.
  const { count: existing } = await supabaseServer
    .from("social_post_recommendations")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId)
    .eq("week_of", weekOf);
  if ((existing ?? 0) > 0) return { count: 0 };

  const mode = await getSocialMode(agentId);
  const status: SocialRecommendation["status"] = mode === "auto" ? "approved" : "suggested";

  const rows: Record<string, unknown>[] = [];

  // (a) 1 TIMELY from the latest published digest's top item.
  const timely = await buildTimelyRow(agentId, weekOf, status);
  if (timely) rows.push(timely);

  // (b) 2 EVERGREEN from the shared library, avoiding recent picks.
  const evergreen = await buildEvergreenRows(agentId, weekOf, status, 2);
  rows.push(...evergreen);

  if (rows.length === 0) return { count: 0 };

  const { data, error } = await supabaseServer
    .from("social_post_recommendations")
    .insert(rows)
    .select("id, source_type, caption, library_id");
  if (error) {
    console.warn(
      `[social] insert recommendations failed for agent ${agentId}:`,
      error.message,
    );
    return { count: 0 };
  }

  const inserted = (Array.isArray(data) ? data : []) as InsertedRec[];

  // Render each card's branded image ONCE and store it, so preview/post uses a
  // stable asset URL (and is the foundation for "swap in your own photo/video").
  // Best-effort: a single failure logs + leaves image_url null (UI falls back to
  // the on-the-fly /api/social/card/[id] route) and never aborts the run.
  // Runs for BOTH the weekly cron and the on-demand /api/social/recommend click.
  await persistCardImages(agentId, inserted);

  // Autopilot auto-schedule: when mode is 'auto' AND the agent has ≥1 connected
  // social account, queue these recs straight into scheduled_posts (the real
  // publish engine picks them up). Best-effort — a failure here never aborts the
  // run, and if there's NO connected account the recs simply stay 'approved'
  // drafts (autopilot without a place to post = still just a draft).
  if (mode === "auto") {
    try {
      const accounts = await getConnectedSocialAccounts(agentId);
      if (accounts.length > 0) {
        // Re-read each inserted rec's persisted image_url (persistCardImages may
        // have populated it after insert). Idempotent: scheduleRecommendation
        // skips recs already 'scheduled'.
        const { data: fresh } = await supabaseServer
          .from("social_post_recommendations")
          .select("id, caption, hashtags, image_url, status")
          .in("id", inserted.map((r) => r.id));
        for (const rec of (fresh ?? []) as Array<
          Pick<SocialRecommendation, "id" | "caption" | "hashtags" | "image_url" | "status">
        >) {
          await scheduleRecommendation(agentId, rec, accounts).catch((e) => {
            console.warn(
              `[social] autopilot schedule failed for rec ${rec.id}:`,
              e instanceof Error ? e.message : e,
            );
            return { scheduledCount: 0, scheduledFor: "" };
          });
        }
      }
    } catch (e) {
      console.warn(
        `[social] autopilot auto-schedule pass failed for agent ${agentId}:`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  return { count: inserted.length };
}

type InsertedRec = {
  id: string;
  source_type: "evergreen" | "timely";
  caption: string;
  library_id: string | null;
};

/**
 * Render + upload each inserted rec's branded card to the social-images bucket,
 * then save the public URL on the row. Best-effort per rec (try/catch each).
 */
async function persistCardImages(
  agentId: string,
  recs: InsertedRec[],
): Promise<void> {
  if (recs.length === 0) return;

  // Branding once for the whole batch.
  const agent = await loadPresentationAgent(agentId).catch(() => null);

  // Signature brand kit (best-effort): brand_color from AI settings + the
  // agent's logo. Only applied when the plan unlocks social_customization; a
  // failure loading either leaves brandKit undefined → the default blue card.
  let brandKit: BrandKit | undefined;
  try {
    if (await agentHasSocialCustomization(agentId)) {
      const settings = await getAgentAiSettings(agentId).catch(() => null);
      const color = settings?.brandColor ?? null;
      const logoUrl = agent?.logoUrl ?? null;
      if (color || logoUrl) brandKit = { color, logoUrl };
    }
  } catch (e) {
    console.warn(
      `[social] brand-kit load failed for agent ${agentId} (using default card):`,
      e instanceof Error ? e.message : e,
    );
  }

  // Resolve library categories for the evergreen cards (the "… TIP" eyebrow).
  const libIds = Array.from(
    new Set(
      recs
        .filter((r) => r.source_type === "evergreen" && r.library_id)
        .map((r) => r.library_id as string),
    ),
  );
  const categoryById = new Map<string, string | null>();
  if (libIds.length > 0) {
    const { data: libs } = await supabaseServer
      .from("social_content_library")
      .select("id, category")
      .in("id", libIds);
    for (const row of (libs ?? []) as { id: string; category: string | null }[]) {
      const cat = typeof row.category === "string" && row.category.trim() ? row.category.trim() : null;
      categoryById.set(String(row.id), cat);
    }
  }

  for (const rec of recs) {
    try {
      // Never overwrite a rec the agent gave their own image (image_source
      // 'custom'). Fresh inserts are always 'branded_card', but guard anyway so
      // this function is safe to call on any rec set.
      const { data: srcRow } = await supabaseServer
        .from("social_post_recommendations")
        .select("image_source")
        .eq("id", rec.id)
        .maybeSingle();
      const imageSource = (srcRow as { image_source?: string } | null)?.image_source;
      if (imageSource === "custom") continue;

      const categoryLabel =
        rec.source_type === "evergreen" && rec.library_id
          ? categoryById.get(rec.library_id) ?? null
          : null;

      const png = await renderCardPng(
        { source_type: rec.source_type, caption: rec.caption },
        agent,
        categoryLabel,
        brandKit,
      );

      const path = `${agentId}/${rec.id}.png`;
      const { error: upErr } = await supabaseServer.storage
        .from("social-images")
        .upload(path, png, { contentType: "image/png", upsert: true });
      if (upErr) throw upErr;

      const url = supabaseServer.storage.from("social-images").getPublicUrl(path).data.publicUrl;

      const { error: updErr } = await supabaseServer
        .from("social_post_recommendations")
        .update({ image_url: url, image_source: "branded_card" })
        .eq("id", rec.id);
      if (updErr) throw updErr;
    } catch (e) {
      // Non-fatal: leave image_url null; the UI falls back to the on-the-fly route.
      console.warn(
        `[social] card image persist failed for rec ${rec.id} (agent ${agentId}):`,
        e instanceof Error ? e.message : e,
      );
    }
  }
}

/**
 * Weekly cron entry point. Iterates every agent that has opted into social
 * recommendations by setting a boss_autopilot_settings row for
 * (marketing_assistant, social) — BOTH 'auto' AND 'ask'.
 *
 * Rationale: 'auto' agents want the queue auto-filled; 'ask' agents still want
 * suggestions waiting when they open the Marketing Assistant on Monday (they
 * just approve each rather than have them pre-approved). generateWeeklyRecommendations
 * is idempotent per (agent, week) and already maps mode → initial status, so a
 * single pass over every opted-in agent is correct for both.
 */
export async function runWeeklyRecommendationsForOptedInAgents(
  now: Date = new Date(),
): Promise<{ weekOf: string; agents: number; created: number }> {
  const weekOf = currentWeekOf(now);
  const { data } = await supabaseServer
    .from("boss_autopilot_settings")
    .select("agent_id")
    .eq("assignee", "marketing_assistant")
    .eq("channel", "social");

  const ids = Array.from(
    new Set(
      ((data ?? []) as { agent_id: number | string }[])
        .map((r) => String(r.agent_id))
        .filter(Boolean),
    ),
  );

  let created = 0;
  for (const agentId of ids) {
    try {
      const { count } = await generateWeeklyRecommendations(agentId, weekOf);
      created += count;
    } catch (e) {
      console.error(
        `[social-weekly] failed for agent ${agentId}:`,
        e instanceof Error ? e.message : e,
      );
    }
  }
  return { weekOf, agents: ids.length, created };
}

// ── composition ───────────────────────────────────────────────────────────────

/**
 * Deterministically rotate the timely pick across the digest's categories so
 * social isn't always mortgage rates. Picks a category by (week-derived index)
 * % (distinct categories present), then the strongest item in that category
 * (one with a real why_it_matters wins), and falls back to items[0] if the
 * digest has no category tags (legacy) or nothing qualifies.
 */
function pickTimelyItem(items: DigestItem[], weekOf: string): DigestItem | null {
  const usable = items.filter((it) => it && it.headline);
  if (usable.length === 0) return null;

  // Distinct categories present, in first-seen order (stable + deterministic).
  const cats: string[] = [];
  for (const it of usable) {
    const c = it.category ?? DEFAULT_DIGEST_CATEGORY;
    if (!cats.includes(c)) cats.push(c);
  }
  if (cats.length === 0) return usable[0];

  // Week-derived rotation index: sum of the date digits keeps it cheap + stable.
  const seed = weekOf.replace(/\D/g, "").split("").reduce((a, d) => a + Number(d), 0);
  const chosenCat = cats[seed % cats.length];

  const inCat = usable.filter(
    (it) => (it.category ?? DEFAULT_DIGEST_CATEGORY) === chosenCat,
  );
  const pool = inCat.length > 0 ? inCat : usable;
  // Prefer an item with a substantive why_it_matters; else first in the pool.
  return pool.find((it) => (it.why_it_matters ?? "").trim().length > 0) ?? pool[0];
}

/** Category-aware hashtags so a non-rates timely pick isn't tagged #mortgagerates. */
function hashtagsForCategory(category?: string | null): string[] {
  const base = ["#realestate", "#housingmarket"];
  const byCat: Record<string, string[]> = {
    economy_rates: ["#mortgagerates", "#homebuyers"],
    legislation_policy: ["#housingpolicy", "#realestatenews"],
    programs_financing: ["#firsttimehomebuyer", "#homefinancing"],
    schools_education: ["#schooldistricts", "#familyhomes"],
    local_economy: ["#localmarket", "#relocation"],
    market_trends: ["#markettrends", "#homebuyers"],
    seasonal_other: ["#homeownership", "#realestatetips"],
  };
  return [...base, ...(byCat[category ?? "market_trends"] ?? byCat.market_trends)];
}

async function buildTimelyRow(
  agentId: string,
  weekOf: string,
  status: SocialRecommendation["status"],
): Promise<Record<string, unknown> | null> {
  const digest = await getLatestDigest();
  if (!digest || !Array.isArray(digest.items) || digest.items.length === 0) return null;

  const top = pickTimelyItem(digest.items, weekOf);
  if (!top || !top.headline) return null;

  // Consumer-voice caption composed ONLY from the digest's already-cited copy —
  // no new numbers introduced here (anti-fabrication).
  const why = top.why_it_matters?.trim();
  // Headline on its own line, then the "why" — reads better as a social caption
  // and lets the card renderer isolate the headline (it takes the first line).
  const caption = [top.headline.trim(), why].filter(Boolean).join("\n\n");

  const link = `${getSiteUrl()}/newsletter/national/${digest.week_of}`;
  const hashtags = hashtagsForCategory(top.category);

  return {
    agent_id: agentId,
    week_of: weekOf,
    source_type: "timely",
    library_id: null,
    timely_ref: digest.week_of,
    caption,
    hashtags,
    link,
    image_prompt: "A clean chart or headline graphic about this week's housing market.",
    status,
  };
}

async function buildEvergreenRows(
  agentId: string,
  weekOf: string,
  status: SocialRecommendation["status"],
  n: number,
): Promise<Record<string, unknown>[]> {
  // Anti-repeat: exclude library rows used in the agent's last ~8 recs.
  const { data: recent } = await supabaseServer
    .from("social_post_recommendations")
    .select("library_id")
    .eq("agent_id", agentId)
    .eq("source_type", "evergreen")
    .order("created_at", { ascending: false })
    .limit(8);
  const recentIds = new Set<string>(
    ((recent ?? []) as { library_id: string | null }[])
      .map((r) => r.library_id)
      .filter((id): id is string => Boolean(id)),
  );

  // Pull a modest pool of active library rows and pick the freshest not-recent
  // ones (with a light shuffle so two agents on the same week don't get an
  // identical pair).
  const { data: lib } = await supabaseServer
    .from("social_content_library")
    .select("id, category, title, hook, body, hashtags, cta, image_prompt")
    .eq("status", "active")
    .limit(200);
  const pool = ((lib ?? []) as LibraryRow[]).filter((r) => !recentIds.has(r.id));
  // Fall back to the full active set if anti-repeat drained the pool.
  const candidates = pool.length >= n ? pool : ((lib ?? []) as LibraryRow[]);

  const picked = shuffle(candidates).slice(0, n);
  return picked.map((row) => ({
    agent_id: agentId,
    week_of: weekOf,
    source_type: "evergreen",
    library_id: row.id,
    timely_ref: null,
    caption: composeEvergreenCaption(row),
    hashtags: Array.isArray(row.hashtags) ? row.hashtags : [],
    link: null,
    image_prompt: row.image_prompt ?? null,
    status,
  }));
}

/** Caption = hook + body (+ cta) from the stored library row. Deterministic. */
function composeEvergreenCaption(row: LibraryRow): string {
  return [row.hook?.trim(), row.body?.trim(), row.cta?.trim()]
    .filter(Boolean)
    .join("\n\n");
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * FALLBACK share-safe URL for the auto-branded post image of a recommendation:
 * the on-the-fly /api/social/card/[id] route. Prefer the stored row.image_url
 * (rendered + uploaded at generation time); use this only when it's null.
 */
export function recommendationImageUrl(recId: string): string {
  return `${getSiteUrl()}/api/social/card/${recId}`;
}

function normalizeRec(row: SocialRecommendation): SocialRecommendation {
  return {
    ...row,
    agent_id: String(row.agent_id),
    hashtags: Array.isArray(row.hashtags) ? row.hashtags : [],
    image_url: typeof row.image_url === "string" && row.image_url.trim() ? row.image_url : null,
  };
}
