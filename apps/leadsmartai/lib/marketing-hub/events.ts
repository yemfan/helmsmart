/**
 * What a hub records about a visit, and what the agent is shown from it.
 *
 * One table (`traffic_events`), one row per event, every row carrying the
 * agent id. `page_view` and `conversion` predate this file and keep their
 * names — the contact journey and the platform funnel both read them. The
 * rest were added for the overview and are written only by the hub beacon.
 *
 * The allowlist is the security boundary for the public beacon: a visitor can
 * only ever write one of these names, with a small, shaped `metadata`.
 *
 * Pure: `summariseHubMetrics` takes rows and returns numbers, so the counting
 * rules are tested without a database.
 */

export const HUB_EVENT_TYPES = [
  "page_view",
  "conversion",
  "hero_cta_click",
  "ai_open",
  "ai_message",
  "home_value_started",
  "home_value_completed",
  "home_search_started",
  "tool_opened",
  "service_click",
  "appointment_started",
  "appointment_booked",
  "social_click",
  "content_opened",
] as const;
export type HubEventType = (typeof HUB_EVENT_TYPES)[number];

/** Events the public beacon may write. Views and conversions have their own routes. */
export const BEACON_EVENT_TYPES: readonly HubEventType[] = [
  "hero_cta_click",
  "ai_open",
  "home_value_started",
  "home_search_started",
  "tool_opened",
  "service_click",
  "appointment_started",
  "social_click",
  "content_opened",
];

export function isBeaconEventType(v: unknown): v is HubEventType {
  return typeof v === "string" && (BEACON_EVENT_TYPES as readonly string[]).includes(v);
}

/** The only metadata keys a beacon may carry, each clamped to a short string. */
const BEACON_META_KEYS = ["label", "tool", "network", "slug", "action", "service"] as const;

export function sanitizeBeaconMeta(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const key of BEACON_META_KEYS) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === "string" && v.trim()) out[key] = v.trim().slice(0, 120);
  }
  return out;
}

// ── the overview ─────────────────────────────────────────────────────────

export type HubEventRow = {
  event_type?: unknown;
  visitor_id?: unknown;
  session_id?: unknown;
  source?: unknown;
  metadata?: unknown;
  created_at?: unknown;
};

export type HubMetrics = {
  days: number;
  views: number;
  visitors: number;
  ctaClicks: number;
  aiConversations: number;
  aiMessages: number;
  leads: number;
  appointments: number;
  homeValueStarted: number;
  homeValueCompleted: number;
  homeSearchStarted: number;
  /** leads / visitors, as a fraction. Null when there were no visitors. */
  conversionRate: number | null;
  topTools: { key: string; count: number }[];
  topContent: { slug: string; count: number }[];
  topSources: { source: string; count: number }[];
  /** Views per day, oldest first, for a sparkline. */
  viewsByDay: { day: string; views: number }[];
  /** True when there is nothing at all to show. */
  empty: boolean;
};

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function top(counter: Map<string, number>, limit: number): { key: string; count: number }[] {
  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

/**
 * Turn the agent's rows for a window into the numbers on the overview.
 *
 * `views` are page_view rows; `visitors` are distinct visitor ids among them
 * (a row without one still counts as a view, never as a visitor — better to
 * undercount people than to count a bot as several). Sources come from
 * page_view rows only, so a conversion's utm does not double-count.
 */
export function summariseHubMetrics(
  rows: readonly HubEventRow[],
  opts: { days: number; now?: number },
): HubMetrics {
  const now = opts.now ?? Date.now();
  const days = Math.max(1, Math.min(365, Math.trunc(opts.days)));

  let views = 0;
  const visitors = new Set<string>();
  let ctaClicks = 0;
  let aiConversations = 0;
  let aiMessages = 0;
  let leads = 0;
  let appointments = 0;
  let homeValueStarted = 0;
  let homeValueCompleted = 0;
  let homeSearchStarted = 0;
  const tools = new Map<string, number>();
  const content = new Map<string, number>();
  const sources = new Map<string, number>();
  const byDay = new Map<string, number>();

  // Pre-fill the window so a quiet day is a zero, not a gap in the line.
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 86_400_000);
    byDay.set(d.toISOString().slice(0, 10), 0);
  }

  for (const row of rows) {
    const type = str(row.event_type);
    const meta = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<
      string,
      unknown
    >;
    switch (type) {
      case "page_view": {
        views++;
        const vid = str(row.visitor_id);
        if (vid) visitors.add(vid);
        const source = str(row.source).trim();
        if (source) sources.set(source, (sources.get(source) ?? 0) + 1);
        const day = str(row.created_at).slice(0, 10);
        if (byDay.has(day)) byDay.set(day, (byDay.get(day) ?? 0) + 1);
        break;
      }
      case "conversion":
        leads++;
        break;
      case "hero_cta_click":
      case "service_click":
        ctaClicks++;
        break;
      case "ai_open":
        aiConversations++;
        break;
      case "ai_message":
        aiMessages++;
        break;
      case "appointment_booked":
        appointments++;
        break;
      case "home_value_started":
        homeValueStarted++;
        break;
      case "home_value_completed":
        homeValueCompleted++;
        break;
      case "home_search_started":
        homeSearchStarted++;
        break;
      case "tool_opened": {
        const key = str(meta.tool).trim();
        if (key) tools.set(key, (tools.get(key) ?? 0) + 1);
        break;
      }
      case "content_opened": {
        const slug = str(meta.slug).trim();
        if (slug) content.set(slug, (content.get(slug) ?? 0) + 1);
        break;
      }
      default:
        break;
    }
  }

  const visitorCount = visitors.size;
  const empty =
    views === 0 && leads === 0 && aiConversations === 0 && ctaClicks === 0 && appointments === 0;

  return {
    days,
    views,
    visitors: visitorCount,
    ctaClicks,
    aiConversations,
    aiMessages,
    leads,
    appointments,
    homeValueStarted,
    homeValueCompleted,
    homeSearchStarted,
    conversionRate: visitorCount > 0 ? leads / visitorCount : null,
    topTools: top(tools, 5),
    topContent: top(content, 5).map(({ key, count }) => ({ slug: key, count })),
    topSources: top(sources, 5).map(({ key, count }) => ({ source: key, count })),
    viewsByDay: [...byDay.entries()].map(([day, v]) => ({ day, views: v })),
    empty,
  };
}
