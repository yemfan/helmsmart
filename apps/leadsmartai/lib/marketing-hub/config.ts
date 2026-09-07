import { z } from "zod";

/**
 * The hub's configuration document — what the agent can change about their
 * public page beyond identity (username, bio, specialties live on `agents`).
 *
 * Stored as one JSONB row in `agent_hub_settings.config`. This file is the
 * single owner of its shape: the editor writes through `normalizeHubConfig`,
 * the public page reads through it, and an unknown or malformed key is
 * dropped rather than rendered. A stale document from an older build can
 * therefore never break the page — it just falls back to the defaults for
 * whatever it no longer knows how to say.
 *
 * COPY IS NULL BY DEFAULT. A `null` headline, CTA label or service name means
 * "use the translated default for this kind". The renderer resolves those
 * through i18n at request time, so a hub the agent never customised is still
 * translated, and one they did customise says exactly what they typed.
 *
 * Pure: no I/O, so every rule here is unit-testable.
 */

// ── actions ──────────────────────────────────────────────────────────────

/** Where a CTA sends the visitor. Everything except `url` is a hub-owned flow. */
export const HUB_ACTION_KINDS = [
  "home_value",
  "find_home",
  "ai_chat",
  "book",
  "contact",
  "call",
  "email",
  "url",
] as const;
export type HubActionKind = (typeof HUB_ACTION_KINDS)[number];

const httpUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || /^https?:\/\//i.test(v), "must start with http(s)://");

const HubActionSchema = z.object({
  kind: z.enum(HUB_ACTION_KINDS).default("contact"),
  url: httpUrl.nullable().default(null),
});
export type HubAction = z.infer<typeof HubActionSchema>;

const HubCtaSchema = z.object({
  /** null → the translated default label for `action.kind`. */
  label: z.string().trim().max(60).nullable().default(null),
  action: HubActionSchema.default({ kind: "contact", url: null }),
});
export type HubCta = z.infer<typeof HubCtaSchema>;

// ── sections ─────────────────────────────────────────────────────────────

export const SERVICE_PRESETS = [
  "buy",
  "sell",
  "invest",
  "relocate",
  "new_construction",
  "analysis",
  "custom",
] as const;
export type ServicePreset = (typeof SERVICE_PRESETS)[number];

export const SERVICE_ICONS = [
  "home",
  "key",
  "trending-up",
  "map-pin",
  "building",
  "bar-chart",
  "calculator",
  "search",
  "handshake",
  "briefcase",
  "star",
  "globe",
] as const;
export type ServiceIcon = (typeof SERVICE_ICONS)[number];

const HubServiceSchema = z.object({
  id: z.string().trim().min(1).max(40),
  preset: z.enum(SERVICE_PRESETS).default("custom"),
  /** null → translated default for the preset (custom presets need a name). */
  name: z.string().trim().max(80).nullable().default(null),
  description: z.string().trim().max(400).nullable().default(null),
  icon: z.enum(SERVICE_ICONS).default("home"),
  cta: HubCtaSchema.default({ label: null, action: { kind: "contact", url: null } }),
  enabled: z.boolean().default(true),
});
export type HubService = z.infer<typeof HubServiceSchema>;

export const ASSISTANT_TONES = ["friendly", "professional", "concise"] as const;
export type AssistantTone = (typeof ASSISTANT_TONES)[number];

/** Roster types that may appear publicly. Max (the agent's captain) is internal. */
export const PUBLIC_WORKFORCE_TYPES = [
  "receptionist",
  "sales_assistant",
  "marketing_assistant",
  "transaction_assistant",
  "accountant",
] as const;
export type PublicWorkforceType = (typeof PUBLIC_WORKFORCE_TYPES)[number];

const WorkforceMemberSchema = z.object({
  type: z.enum(PUBLIC_WORKFORCE_TYPES),
  visible: z.boolean().default(true),
  /** null → translated default description for the type. */
  description: z.string().trim().max(300).nullable().default(null),
});
export type WorkforceMember = z.infer<typeof WorkforceMemberSchema>;

const SOCIAL_NETWORKS = [
  "facebook",
  "instagram",
  "tiktok",
  "youtube",
  "threads",
  "linkedin",
  "x",
] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];
export { SOCIAL_NETWORKS };

const FeaturedItemSchema = z.object({
  id: z.string().trim().min(1).max(40),
  /** post = one of the agent's published feed items (ref = feed slug); link = any URL; tool = a tool key. */
  kind: z.enum(["post", "link", "tool"]).default("link"),
  ref: z.string().trim().max(300).default(""),
  title: z.string().trim().max(120).nullable().default(null),
  description: z.string().trim().max(300).nullable().default(null),
  /** Shown as a small label — "Guide", "Market update", "Video". */
  badge: z.string().trim().max(40).nullable().default(null),
});
export type FeaturedItem = z.infer<typeof FeaturedItemSchema>;

export const BOOKING_MODES = ["auto", "receptionist", "external", "request", "off"] as const;
export type BookingMode = (typeof BOOKING_MODES)[number];

export const HUB_ACCENTS = ["navy", "blue", "emerald", "gold", "slate"] as const;
export type HubAccent = (typeof HUB_ACCENTS)[number];

export const HUB_LAYOUTS = ["pages", "single"] as const;
export type HubLayout = (typeof HUB_LAYOUTS)[number];

const MarketAreaSchema = z.object({
  name: z.string().trim().min(1).max(80),
  /** Optional blurb — "Where I grew up", "Best value in the valley". */
  note: z.string().trim().max(160).nullable().default(null),
});
export type MarketArea = z.infer<typeof MarketAreaSchema>;

const strList = (max: number, itemMax = 80) =>
  z
    .array(z.string().trim().min(1).max(itemMax))
    .max(max)
    .default([]);

export const HubConfigSchema = z.object({
  profile: z
    .object({
      /** "Real Estate Advisor", "Broker Associate". */
      title: z.string().trim().max(80).nullable().default(null),
      /** "Greater Los Angeles" — the market line under the name. */
      location: z.string().trim().max(120).nullable().default(null),
      yearsExperience: z.number().int().min(0).max(70).nullable().default(null),
      languages: strList(8, 40),
      website: httpUrl.nullable().default(null),
      showPhone: z.boolean().default(true),
      showEmail: z.boolean().default(true),
      /** Free-text credentials — "CRS", "Certified Negotiation Expert". */
      credentials: strList(8, 80),
    })
    .default({}),

  hero: z
    .object({
      enabled: z.boolean().default(true),
      headline: z.string().trim().max(140).nullable().default(null),
      subheadline: z.string().trim().max(300).nullable().default(null),
      /** First is primary. Up to three. */
      ctas: z.array(HubCtaSchema).max(3).default([]),
      backgroundUrl: httpUrl.nullable().default(null),
    })
    .default({}),

  assistant: z
    .object({
      enabled: z.boolean().default(true),
      greeting: z.string().trim().max(400).nullable().default(null),
      suggestedPrompts: strList(8, 80),
      /** Facts the assistant may use — hours, services, fees, FAQs. */
      knowledge: z.string().trim().max(6000).nullable().default(null),
      tone: z.enum(ASSISTANT_TONES).default("friendly"),
      captureLeads: z.boolean().default(true),
      /** When the visitor asks for a human, which handoffs to offer. */
      offerPhone: z.boolean().default(true),
      offerBooking: z.boolean().default(true),
    })
    .default({}),

  workforce: z
    .object({
      enabled: z.boolean().default(true),
      members: z.array(WorkforceMemberSchema).max(PUBLIC_WORKFORCE_TYPES.length).default([]),
      showHowItWorks: z.boolean().default(true),
      /**
       * Show real, anonymised counts from the last 30 days (calls the AI
       * receptionist handled, texts the AI sent, appointments it booked).
       * Opt-in: the numbers are the agent's own business to disclose.
       */
      showActivity: z.boolean().default(false),
    })
    .default({}),

  services: z
    .object({
      enabled: z.boolean().default(true),
      headline: z.string().trim().max(120).nullable().default(null),
      items: z.array(HubServiceSchema).max(12).default([]),
    })
    .default({}),

  tools: z
    .object({
      enabled: z.boolean().default(true),
      /** Ordered tool keys from lib/marketing-hub/tools.ts. */
      keys: strList(16, 40),
    })
    .default({}),

  homeValue: z
    .object({
      enabled: z.boolean().default(true),
      headline: z.string().trim().max(120).nullable().default(null),
      body: z.string().trim().max(300).nullable().default(null),
    })
    .default({}),

  areas: z
    .object({
      enabled: z.boolean().default(true),
      headline: z.string().trim().max(120).nullable().default(null),
      items: z.array(MarketAreaSchema).max(24).default([]),
    })
    .default({}),

  content: z
    .object({
      showFeed: z.boolean().default(true),
      featured: z.array(FeaturedItemSchema).max(6).default([]),
    })
    .default({}),

  social: z
    .object(
      Object.fromEntries(
        SOCIAL_NETWORKS.map((n) => [n, httpUrl.nullable().default(null)]),
      ) as Record<SocialNetwork, z.ZodDefault<z.ZodNullable<typeof httpUrl>>>,
    )
    .default({}),

  leadCapture: z
    .object({
      showForm: z.boolean().default(true),
      bookingMode: z.enum(BOOKING_MODES).default("auto"),
      externalBookingUrl: httpUrl.nullable().default(null),
      notifyEmail: z.boolean().default(true),
      notifyPush: z.boolean().default(true),
      createTask: z.boolean().default(true),
      enrollFollowUp: z.boolean().default(true),
    })
    .default({}),

  trust: z
    .object({
      enabled: z.boolean().default(true),
      headline: z.string().trim().max(120).nullable().default(null),
      /** Free-text reasons — never invented; empty renders nothing. */
      points: strList(8, 160),
      showTestimonials: z.boolean().default(true),
    })
    .default({}),

  finalCta: z
    .object({
      enabled: z.boolean().default(true),
      headline: z.string().trim().max(120).nullable().default(null),
      body: z.string().trim().max(300).nullable().default(null),
      ctas: z.array(HubCtaSchema).max(3).default([]),
    })
    .default({}),

  seo: z
    .object({
      title: z.string().trim().max(120).nullable().default(null),
      description: z.string().trim().max(320).nullable().default(null),
      keywords: strList(12, 60),
      ogImageUrl: httpUrl.nullable().default(null),
      noindex: z.boolean().default(false),
    })
    .default({}),

  appearance: z
    .object({
      accent: z.enum(HUB_ACCENTS).default("navy"),
      /**
       * `pages`: a real multi-page site — home, about, services, tools,
       * areas, posts, contact — with a menu. `single`: everything on one
       * long page with anchor links. Pages is the default; it is what a
       * professional real estate site looks like.
       */
      layout: z.enum(HUB_LAYOUTS).default("pages"),
    })
    .default({}),

  footer: z
    .object({
      /** Extra disclosure the agent's state or brokerage requires. */
      disclosure: z.string().trim().max(600).nullable().default(null),
    })
    .default({}),
});

export type HubConfig = z.infer<typeof HubConfigSchema>;
export type HubSectionKey = keyof HubConfig;

/** The document a brand-new hub has. */
export function defaultHubConfig(): HubConfig {
  return HubConfigSchema.parse({});
}

/**
 * Coerce whatever is stored into a valid document.
 *
 * Section by section rather than all-or-nothing: one bad service row must
 * not reset the agent's hero copy. A section that fails validation falls
 * back to its default; a section that passes keeps every field it had.
 */
export function normalizeHubConfig(raw: unknown): HubConfig {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(HubConfigSchema.shape) as HubSectionKey[]) {
    const section = HubConfigSchema.shape[key];
    const parsed = section.safeParse(input[key] ?? {});
    out[key] = parsed.success ? parsed.data : section.parse({});
  }
  return out as HubConfig;
}

/**
 * Validate a full document from the editor. Unlike `normalizeHubConfig` this
 * REPORTS problems, because the person on the other end can fix them.
 */
export function validateHubConfig(raw: unknown):
  | { ok: true; config: HubConfig }
  | { ok: false; problems: { path: string; message: string }[] } {
  const parsed = HubConfigSchema.safeParse(raw ?? {});
  if (parsed.success) return { ok: true, config: parsed.data };
  return {
    ok: false,
    problems: parsed.error.issues.slice(0, 10).map((i) => ({
      path: i.path.join("."),
      message: i.message,
    })),
  };
}

/** Merge a partial patch (one editor section at a time) into a document. */
export function mergeHubConfig(current: HubConfig, patch: Partial<HubConfig>): HubConfig {
  const next: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    next[key] = value;
  }
  return normalizeHubConfig(next);
}

// ── derived views the renderer needs ─────────────────────────────────────

/** Default hero CTAs when the agent has chosen none. First is primary. */
export const DEFAULT_HERO_CTAS: HubCta[] = [
  { label: null, action: { kind: "home_value", url: null } },
  { label: null, action: { kind: "find_home", url: null } },
  { label: null, action: { kind: "ai_chat", url: null } },
];

/** Default closing CTAs. */
export const DEFAULT_FINAL_CTAS: HubCta[] = [
  { label: null, action: { kind: "ai_chat", url: null } },
  { label: null, action: { kind: "book", url: null } },
  { label: null, action: { kind: "home_value", url: null } },
];

/** Default services for a hub the agent has not configured. */
export function defaultServices(): HubService[] {
  const mk = (
    id: ServicePreset,
    icon: ServiceIcon,
    kind: HubActionKind,
  ): HubService => ({
    id,
    preset: id,
    name: null,
    description: null,
    icon,
    cta: { label: null, action: { kind, url: null } },
    enabled: true,
  });
  return [
    mk("buy", "key", "find_home"),
    mk("sell", "home", "home_value"),
    mk("invest", "trending-up", "ai_chat"),
    mk("relocate", "map-pin", "ai_chat"),
  ];
}

/** Default tools for a hub the agent has not configured. */
export const DEFAULT_TOOL_KEYS = [
  "home_value",
  "mortgage",
  "affordability",
  "closing_cost",
  "rent_vs_buy",
  "investment_analyzer",
] as const;

/**
 * Which services to render: the agent's list if they saved one, else the
 * defaults. An explicitly empty list is respected (they removed them all).
 */
export function servicesToRender(config: HubConfig, hasSavedConfig: boolean): HubService[] {
  const items = hasSavedConfig || config.services.items.length ? config.services.items : defaultServices();
  return items.filter((s) => s.enabled);
}

export function toolKeysToRender(config: HubConfig, hasSavedConfig: boolean): string[] {
  if (hasSavedConfig || config.tools.keys.length) return config.tools.keys;
  return [...DEFAULT_TOOL_KEYS];
}

export function heroCtasToRender(config: HubConfig): HubCta[] {
  return config.hero.ctas.length ? config.hero.ctas : DEFAULT_HERO_CTAS;
}

export function finalCtasToRender(config: HubConfig): HubCta[] {
  return config.finalCta.ctas.length ? config.finalCta.ctas : DEFAULT_FINAL_CTAS;
}

/** Social links that are actually set, in display order. Never an empty icon. */
export function socialLinks(config: HubConfig): { network: SocialNetwork; url: string }[] {
  return SOCIAL_NETWORKS.flatMap((network) => {
    const url = config.social[network];
    return url ? [{ network, url }] : [];
  });
}

/**
 * The href a CTA resolves to, given the hub's handle and the agent's contact
 * details. `ai_chat` and `contact` are in-page anchors so the visitor never
 * leaves; the rest are hub-owned routes that keep attribution.
 */
export function actionHref(
  action: HubAction,
  ctx: { username: string; phone: string | null; email: string | null; externalBookingUrl: string | null },
): string | null {
  switch (action.kind) {
    case "home_value":
      return `/@${ctx.username}/home-value`;
    case "find_home":
      return `/homes?agent=${encodeURIComponent(ctx.username)}`;
    case "ai_chat":
      return "#assistant";
    case "contact":
      return "#contact";
    case "book":
      return ctx.externalBookingUrl ?? `/@${ctx.username}/book`;
    case "call":
      return ctx.phone ? `tel:${ctx.phone.replace(/[^\d+]/g, "")}` : null;
    case "email":
      return ctx.email ? `mailto:${ctx.email}` : null;
    case "url":
      return action.url || null;
    default:
      return null;
  }
}
