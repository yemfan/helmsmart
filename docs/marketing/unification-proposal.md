# Marketing Unification — Design Doc

**Status:** Approved direction (2026‑08‑01). Interface design below is the contract for Phase 0.
**Scope:** Let `apps/marketingboss` reuse the marketing tooling shared today by `apps/leadsmartai` (CloseBoss) and `apps/helmsmart-web` (HelmSmart), **without forking** and **without merging databases**.
**Owner:** Michael Ye · drafted with Claude Code.

---

## 1. Background & findings

The marketing stack already has a deliberate split:

- **`packages/dna-marketing` (`@helm/dna-marketing`)** is a **pure, storage‑ and identity‑agnostic** package — zero dependencies, zero Supabase, zero table names, no assumed `org`/`contact`/`user` id. It provides *judgment*: claim‑safety screening, cadence/scheduling math, publish‑mode gates (`draft`/`review`/`assisted`/`auto`), platform capability rules, and the Meta/Instagram/Threads **request builders** (they return `{url, body}` — the app performs the fetch).
- **CloseBoss and HelmSmart are two adapters** on top of it, against entirely different schemas and identities:
  - CloseBoss keys on **`agent_id`**: `social_accounts` (encrypted tokens), `scheduled_posts`, `boss_autopilot_settings`, `social_ads`, `social_content_library`, market warehouse (`market_metrics`/`market_geographies`).
  - HelmSmart keys on **`organization_id`**: `org_oauth_tokens` (encrypted), `social_posts`, `org_social_autopilot`, `knowledge_base`.

The package's own docblock states the boundary: *"the shareable asset is the JUDGEMENT, not the plumbing."*

**MarketingBoss today** is a per‑user, credit‑metered fal.ai media generator with YouTube connect, on its own Supabase (`vsmeeydxkbrupzbnpcwq`): `profiles`/`credits`, `generations`, `social_connections` (YouTube), `media` bucket. It does **not** consume `@helm/dna-marketing`.

**Conclusion:** MarketingBoss becomes the **third adapter**. A literal copy from CloseBoss would drag in `agent_id` coupling, real‑estate grounding, and brand‑hardcoded renderers — the drift trap we explicitly avoid.

---

## 2. Principles

1. **Share the judgment, adapt the plumbing.** Pure decision logic lives in shared packages; data access, identity, encryption, and billing stay app‑local.
2. **Third adapter, not a fork.** Three data models coexist behind interfaces.
3. **Promote‑not‑duplicate.** With a third consumer, a few things worth writing once move *into* packages (publisher orchestration, brand‑tokenized rendering, autopilot engine) so each app's adapter stays thin.
4. **No shared data path.** Three separate Supabase projects — only *code* is shared, never tables.
5. **Brand isolation.** MarketingBoss is a distinct product: its own OAuth apps (own consent branding), its own brand kit.

---

## 3. Package map (target)

| Package | Purity | Contents | Deps |
|---|---|---|---|
| `@helm/dna-marketing` *(existing, unchanged philosophy)* | **Pure** (no fetch, no deps) | claim screen/review, cadence math, publish‑mode gate, platform rules, request **builders** (add pure builders for Pinterest/YouTube/TikTok), `ProductFacts` | none |
| `@helm/marketing-publish` *(new)* | Orchestration (uses global `fetch`; **no React**) | `ConnectionStore`, `PlatformPublisher`, `publishToAll`, retry/parse wiring over the pure builders; autopilot store interfaces + `runAutopilot` | `@helm/dna-marketing` |
| `@helm/marketing-render` *(new)* | Rendering (React/satori) | brand‑tokenized `renderAd` + `BrandKit`, layouts×themes | `react`, `satori`/`next-og` (peer) |

Rationale for splitting `-publish` and `-render` out of `dna-marketing`: keep the pure core dependency‑free and side‑effect‑free (it's the one the boundary checker guards). `fetch` orchestration and React rendering are impure/heavy and belong in dedicated packages that *depend on* the core.

---

## 4. Interface design (the contract)

All identifiers below are **opaque to the packages** — apps close over their own identity (`agent_id`/`organization_id`/`user_id`) when they construct the adapters.

### 4.1 Platforms, connections, tokens

```ts
// @helm/dna-marketing  (extend the existing SocialPlatform union)
export type SocialPlatform =
  | "facebook" | "instagram" | "linkedin" | "threads"
  | "pinterest" | "youtube" | "tiktok" | "x";

// @helm/marketing-publish
/** One connected account's live credentials + the ids a publisher needs. */
export interface SocialConnection {
  platform: SocialPlatform;
  accessToken: string;
  /** Channel/page/board id etc. (YouTube channel, FB page, Pinterest board). */
  providerAccountId?: string | null;
  /** Platform extras: { igBusinessUserId, fbPageId, linkedinMemberUrn, boardId, ... }. */
  metadata?: Record<string, string | null>;
  refreshToken?: string | null;
  /** epoch ms; publisher refreshes via ConnectionStore when near expiry. */
  expiresAt?: number | null;
}

/**
 * The app owns the token table, encryption, identity, and refresh. It hands the
 * publisher a store already scoped to one principal (agent/org/user).
 */
export interface ConnectionStore {
  get(platform: SocialPlatform): Promise<SocialConnection | null>;
  list(): Promise<SocialConnection[]>;
  /** A guaranteed‑fresh access token; refreshes + persists if expired. */
  freshAccessToken(platform: SocialPlatform): Promise<string>;
}
```

Adapter examples: CloseBoss backs this with `social_accounts` + `token-enc.ts` keyed by `agent_id`; HelmSmart with `org_oauth_tokens` + `crypto.ts` keyed by `organization_id`; **MarketingBoss with `social_connections` keyed by `user_id`** (its existing `lib/social.ts` already implements `getValidAccessToken` — it becomes the `freshAccessToken` impl).

### 4.2 Media & post content

```ts
// @helm/marketing-publish
export interface MediaAsset {
  kind: "image" | "video";
  url: string;              // publicly fetchable (Supabase Storage, CDN, …)
  mimeType?: string;
}

export interface PostContent {
  caption: string;
  media: MediaAsset[];      // 0..n; validated against platform rules
  title?: string;           // YouTube
  privacy?: "public" | "unlisted" | "private"; // YouTube
  link?: string;
  /** Pinterest board, etc. — passthrough the publisher understands. */
  platformOptions?: Partial<Record<SocialPlatform, Record<string, string>>>;
}
```

MarketingBoss supplies `MediaAsset` from its fal.ai `generations` (a Storage URL) — its differentiator.

### 4.3 Publisher orchestration

```ts
// @helm/marketing-publish
export interface PublishResult {
  platform: SocialPlatform;
  ok: boolean;
  externalId?: string;      // post/video id
  url?: string;             // permalink
  error?: string;
  retryable?: boolean;
}

export interface PublishEvent {
  platform: SocialPlatform;
  phase: "validating" | "uploading" | "publishing" | "done" | "error";
  detail?: string;
}

export interface PublishInput {
  platforms: SocialPlatform[];
  content: PostContent;
  connections: ConnectionStore;
  /** Defaults to global fetch; injectable for tests/proxies. */
  fetchImpl?: typeof fetch;
  onEvent?: (e: PublishEvent) => void;
}

/**
 * Validate content against each platform's rules (from dna-marketing), pull a
 * fresh token from the store, build the request (pure builders), fetch, parse,
 * and retry per the package's rules. One result per platform; never throws.
 */
export declare function publishToAll(input: PublishInput): Promise<PublishResult[]>;
```

This is the "write once" win: today each app hand‑rolls fetch + token‑read + parse per platform. After Phase 0 they call `publishToAll` and only implement `ConnectionStore`.

### 4.4 Brand‑tokenized ad rendering

```ts
// @helm/marketing-render
export interface BrandKit {
  name: string;                 // wordmark text ("" to hide)
  logoDataUri?: string;         // inline logo (data: URI, CSP‑safe)
  domain?: string;              // footer URL
  tagline?: string;
  colors: { bg: string; fg: string; accent: string; muted?: string };
  fontFamily?: string;
}

export type AdLayout = "bold" | "photo" | "stat" | "spotlight" | "feature" | "hook";
export type AdAspect = "1:1" | "9:16" | "16:9" | "4:5";

export interface AdSpec {
  layout: AdLayout;
  brand: BrandKit;              // brand is INPUT — renderer is brand‑agnostic
  headline: string;
  subhead?: string;
  stat?: { value: string; label: string };
  photoUrl?: string;
  aspect?: AdAspect;            // default 1:1
}

/** Returns a satori/next-og-ready React element. App wraps in ImageResponse. */
export declare function renderAd(spec: AdSpec): import("react").ReactElement;
```

This de‑couples the renderer from CloseBoss's/AVASC's hardcoded wordmarks and gives MarketingBoss a **brand kit** for free. CloseBoss/HelmSmart migrate their existing `renderAd.tsx` to pass a `BrandKit` instead of literals (their real‑estate/anti‑scam *presets* stay app‑local).

### 4.5 Autopilot engine

```ts
// @helm/dna-marketing  (planning is pure — already has the cadence math)
export type PublishMode = "draft" | "review" | "assisted" | "auto";

export interface AutopilotSettings {
  mode: PublishMode;
  postsPerWeek: number;
  platforms: SocialPlatform[];
  postDays?: number[];          // 0–6 (UTC)
  postHourUtc?: number;
  contentCategories?: string[];
}

export interface PlanSlot { scheduledAt: number; category?: string; platform: SocialPlatform; }

/** Pure: turn settings → time slots (uses planPublishTimes/spreadPublishTime). */
export declare function planSchedule(settings: AutopilotSettings, now: number): PlanSlot[];

// @helm/marketing-publish  (persistence is app‑local behind stores)
export interface PlannedPost {
  id?: string;
  platform: SocialPlatform;
  content: PostContent;
  scheduledAt: number;          // epoch ms
  status?: "draft" | "queued" | "published" | "failed";
}

export interface SettingsStore { get(): Promise<AutopilotSettings | null>; }

export interface QueueStore {
  enqueue(posts: PlannedPost[]): Promise<void>;
  dueNow(now: number): Promise<PlannedPost[]>;
  markResult(id: string, result: PublishResult): Promise<void>;
}

/** A generator supplied by the app (its own grounding + model call). */
export type ContentGenerator = (slot: PlanSlot, ctx: ContentContext) => Promise<PostContent>;

/** Plan (if empty), generate, gate by mode, enqueue. Called from a weekly cron. */
export declare function runAutopilotPlanning(input: {
  settings: SettingsStore;
  queue: QueueStore;
  generate: ContentGenerator;
  context: ContentContext;
  now: number;
}): Promise<{ planned: number; mode: PublishMode }>;

/** Publish everything due, respecting the mode gate. Called from a drain cron. */
export declare function runAutopilotDrain(input: {
  queue: QueueStore;
  connections: ConnectionStore;
  now: number;
}): Promise<PublishResult[]>;
```

Each app supplies `SettingsStore`/`QueueStore` over its own tables (`boss_autopilot_settings`+`scheduled_posts` / `org_social_autopilot`+`social_posts` / **new `mkb_autopilot_settings`+`mkb_scheduled_posts`**) and its own cron endpoints.

### 4.6 Content grounding

```ts
// @helm/dna-marketing already exposes ProductFacts for claim review.
export interface ProductFacts {
  capabilities: string[];
  sanctionedNumbers?: string[];
  forbiddenNames?: string[];    // competitor names to screen out
}

// @helm/marketing-publish
/** Everything a ContentGenerator grounds on. Apps assemble this from their KB. */
export interface ContentContext {
  brand: BrandKit;
  facts: ProductFacts;
  audience?: string;
  knowledge?: { title: string; content: string }[]; // brand notes / KB snippets
}
```

`ProductFacts` is the existing injection point for the shared **claim‑safety gate** (`screenClaims` + LLM `claimReview`), which MarketingBoss reuses unchanged. Grounding *sources* stay app‑local: CloseBoss → warehouse + content library; HelmSmart → `knowledge_base`; **MarketingBoss → its brand kit + a small brand‑notes table.**

---

## 5. MarketingBoss adapter (what Phase 1+ builds)

| Seam | MarketingBoss implementation |
|---|---|
| Identity | `user_id` from Supabase auth (existing) |
| `ConnectionStore` | over `social_connections` (extend beyond YouTube to FB/IG/LinkedIn/Threads/Pinterest); reuse `lib/social.ts` refresh |
| `MediaAsset` | fal.ai `generations` Storage URLs |
| `SettingsStore`/`QueueStore` | new `mkb_autopilot_settings`, `mkb_scheduled_posts` (RLS owner‑scoped; tokens stay in RLS‑denied `social_connections`) |
| `BrandKit` | new `mkb_brand_kits` (logo/colors/voice per user) |
| `ContentContext` | brand kit + optional brand‑notes; `ProductFacts` from the brand kit |
| OAuth apps | MarketingBoss‑branded apps per platform (own consent screen), like its YouTube app |
| Crons | `/api/cron/autopilot-plan` (weekly) + `/api/cron/autopilot-drain` (*/15) |

Billing/credits stay entirely app‑local (never in a package): posting may cost 0 credits; generation still meters.

---

## 6. Capability inventory → verdict

| CloseBoss capability | MarketingBoss |
|---|---|
| Social publishing (FB/IG/LinkedIn/Threads/Pinterest) | ✅ via shared publisher + `social_connections` |
| Themeable ad images (satori) | ✅ generalized via `@helm/marketing-render` + brand kit |
| Scheduling + autopilot | ✅ shared engine + `mkb_*` stores |
| Claim‑safety gate | ✅ reuse as‑is (inject `ProductFacts`) |
| Carousels / Reels (Remotion) | 🟡 later (fal.ai already covers video) |
| Market reports / newsletter / data‑center research | ❌ real‑estate/CRM‑bound — out of scope |
| CRM contacts / drip / outreach | ❌ not marketing‑creative — out of scope |

---

## 7. Decisions (resolved)

1. **Third adapter, promote‑not‑fork** — approved.
2. **MarketingBoss stays per‑user + own Supabase + own OAuth apps** — approved. (The "platform‑level, never per‑tenant" rule from HelmSmart governs tenants *within* a product; across distinct products, separate OAuth apps are correct for consent branding.)
3. **Phase 1 = multi‑channel publishing** is the first target.
4. **Real‑estate tooling (market reports/newsletter/data‑center) is out of scope** for MarketingBoss.

---

## 8. Phased roadmap

- **Phase 0 — enabling refactor (packages).** Create `@helm/marketing-publish`; define §4.1–4.3 interfaces; implement `publishToAll` over the existing pure builders; add pure builders for Pinterest/YouTube/TikTok to `@helm/dna-marketing`. Migrate CloseBoss + HelmSmart publishers onto `publishToAll` with **zero behavior change** (proves the seam three‑ways). *Small, high‑leverage.*
- **Phase 1 — MarketingBoss multi‑channel publishing.** `social_connections` `ConnectionStore`; connect UI + OAuth for FB/IG/LinkedIn/Threads/Pinterest (own apps); "Publish to…" multi‑select on the result popup. *Headline win: generate → post everywhere.*
- **Phase 2 — brand kit + ad render.** `@helm/marketing-render`; `mkb_brand_kits`; branded ad images; migrate CloseBoss/HelmSmart renderers to `BrandKit`.
- **Phase 3 — scheduling + autopilot.** `mkb_*` stores; plan/drain crons; §4.5 engine.
- **Phase 4 — grounded captions.** `ContentContext` from the brand kit + claim‑safety gate.

---

## 9. Non‑goals & risks

- **Non‑goals:** merging Supabase projects; forking brand‑locked app code; putting billing or real‑estate grounding into a package.
- **Risks:** (a) package proliferation — mitigate by keeping only three packages and folding autopilot orchestration into `@helm/marketing-publish`; (b) the boundary checker (`scripts/check-boundaries.mjs`) — new packages must respect it; (c) OAuth review — MarketingBoss's own social apps each need their platform's app review before public multi‑user (works for test users first, same as YouTube).
- **Cleanup noted:** MarketingBoss `.env.local` anon key references the wrong Supabase ref (`vpmwsnoosuiknyzdxgtk`); prod is unaffected (`next.config.ts` hardcodes `vsmeeydxkbrupzbnpcwq`), but local dev is misconfigured.

---

## 10. Appendix — key reference files

- Pure core: `packages/dna-marketing/src/{index.ts,campaigns.ts,social/*}`
- CloseBoss adapters: `apps/leadsmartai/lib/social/{reviewClaims,productFacts,recommend,autopilotConfig,renderAd,adPresets,scheduleAd,connectionsService}.ts`, `apps/leadsmartai/lib/leads-gen/publish.ts`
- HelmSmart adapters: `apps/helmsmart-web/lib/{meta,threads,social-platforms,social-autopilot}.ts`, `apps/helmsmart-web/lib/social/{renderAd,scamTrees}.ts`
- MarketingBoss: `apps/marketingboss/lib/{social.ts,youtube.ts}`, `app/api/youtube/*`
