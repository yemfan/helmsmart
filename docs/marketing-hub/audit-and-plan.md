# CloseBoss Marketing Hub — audit and implementation plan (2026-09-06)

Scope: `apps/leadsmartai` (the CloseBoss web app). Public hub lives at
`closebossai.com/@<username>` (rewritten to `app/a/[username]`), editor at
`/dashboard/hub`.

## A. Current architecture (what exists)

| Layer | What is there | Files |
|---|---|---|
| Identity | `agents.username` (unique, reserved list + trigger), `agents.bio`, `agents.specialties[]`, `agents.hub_published` | `supabase/migrations/20260829{12,14}0000_*`, `lib/identity/username.ts` |
| Loader | `loadHubByUsername()` — service-role reads scoped by agent id; three states ready / coming_soon / not_found; thin-hub `noindex` bar | `lib/marketing-hub/loadHub.ts`, `feedItems.ts` |
| Public page | Hero (photo, name, brand, areas), bio, specialty chips, 3 hard-coded CTAs, social post feed with platform filter, contact form, one-line footer | `app/a/[username]/page.tsx`, `HubFeed.tsx`, `HubLeadForm.tsx` |
| Content pages | `/@user/p/<slug>` one page per cross-posted piece | `app/a/[username]/p/[slug]/page.tsx`, `lib/marketing-hub/contentPages.ts` |
| Lead capture | `POST /api/public/hub/[username]/lead` — agent resolved from the path only; dedupe on phone OR email; consent audit row; visitor stitch; `conversion` traffic event | `app/api/public/hub/[username]/lead/route.ts` |
| Analytics | `traffic_events` gained `agent_id / visitor_id / session_id / contact_id`; first-party httpOnly cookies `cb_vid` / `cb_sid`; view beacon; per-contact journey in the lead drawer | `view/route.ts`, `lib/marketing-hub/visitor.ts`, `components/closeboss/HubJourney.tsx` |
| Agent tags | GA4 (all plans) and Meta Pixel (Premium), suppressed by `Sec-GPC` | `lib/marketing-hub/tracking.ts`, `HubTags.tsx`, `agent_tracking_config` |
| Editor | username, bio, specialties, publish toggle, GA/Pixel ids | `app/dashboard/hub/HubSettingsClient.tsx`, `api/dashboard/hub/{profile,tracking}` |

Adjacent systems that the hub can reuse:

- CRM: `contacts` (one `phone` column, `agent_id` nullable, unique per agent on email and phone, `source`, `source_detail`, `tool_used`, `intent`, `property_address`, `estimated_home_value`, `rating hot|warm|cold`, `lead_status`, `sms_opt_in`). Tasks in `crm_tasks`. Follow-up rail: `scheduleEmailSequenceForLead()`. Notifications: `insertAgentInboxNotification()`, `dispatchMobileHotLeadPush()`, `sendEmail()`.
- AI: `getAnthropicClient()` + `BOSS_AGENT_MODEL` (`lib/ai/config.ts`), prompt caching via `@leadsmart/shared/utils/promptCache`. There is **no public visitor-facing AI chat anywhere**; the closest analogs are the SMS responder (structured lead extraction) and the Retell receptionist (`voice_receptionist_settings.extra_notes` as knowledge, `ai_assistants.voice_knowledge`).
- AI workforce: roster `AI_TEAM` (Max, Emma, Chris, Ruby, Grace, Oliver) from `@helm/pack-real-estate`; per-agent rows in `ai_assistants` (`status active|paused`, `avatar_id`, `name`); receptionist on/off in `voice_receptionist_settings.enabled`; booking engine `getAvailability()` / `bookAppointment()` in `lib/voice-agent/booking.ts` writing `voice_appointments`.
- Tools: ~14 pure client calculators at `/mortgage-calculator`, `/affordability-calculator`, `/down-payment-calculator`, `/rent-vs-buy-calculator`, `/closing-cost-estimator`, `/cap-rate-calculator`, `/cash-flow-calculator`, `/roi-calculator`, `/property-investment-analyzer`, `/refinance-calculator`, `/adjustable-rate-calculator`; home value engine `POST /api/property/estimate` (guests allowed); AI home search `/homes/search` (public, rate limited).
- Trust: `testimonials` table (`agent_id, rating, body, author_name, author_title, is_published`).
- Design system: Tailwind v4 tokens in `app/globals.css` (`--color-brand-*` OKLCH ramp anchored on `#0072ce`, elevation shadows, Geist fonts, `.ui-*` type scale), `components/ui/{button,card,dialog,Toggle,Skeleton,EmptyState}`, `components/settings/SettingsGroupPage` + `SettingsCard`, lucide icons.
- i18n: every string in `app/` and `components/` must go through `t()`; keys must exist in `packages/i18n/locales/{en,zh-Hans}`; enforced by `lib/i18n/__tests__/*`.

## B. Current functionality

Handle claim, bio, specialties, publish switch, social feed with platform filter, contact form with SMS consent, view + conversion tracking, contact-level journey, agent GA4/Pixel. That is a profile page with a feed.

## C. Missing functionality (against the spec)

Hero configuration and CTA choice; AI assistant (the single most important feature); AI workforce section; "watch my AI work"; configurable services; tools section; an attributed home-value funnel; an attributed home-search entry; market areas; featured content; social profile links; trust / testimonials; final CTA; compliance footer; overview metrics; editor sections for all of the above; SEO fields and structured data; event tracking beyond view/conversion; booking.

## D. UX problems found

1. **The agent's page renders inside CloseBoss's marketing chrome.** `components/AppShell.tsx` has no case for `/a/` or `/@`, so every hub shows CloseBoss's top nav, the "Ask Max" band, the CloseBoss footer and a floating CloseBoss signup CTA around the agent's content. A visitor cannot tell whose page it is.
2. The three hero CTAs are hard-coded and two of them lose attribution (see E1).
3. No way to reach the agent's AI, no services, no tools, no trust — the page answers "who is this" but not "how can they help me" or "what do I do next".
4. Editor is a single form with no preview, no sections, no metrics; the agent cannot see whether the hub does anything.
5. `service_areas_v2` rows are objects `{city,state,county}`; `stringList()` renders them as `[object Object]` on the hub.

## E. Technical problems found

1. `/home-value?agent=` and `/homes?agent=` are linked from the hub, but neither page reads `agent`; `/home-value-widget` reads `agentId` and `POST /api/home-value-leads` then hard-codes `agent_id: null` (and upserts a `type` column that does not exist). Hub-referred home-value leads land in the unassigned pool.
2. `POST /api/idx/lead-capture` assigns by ZIP round-robin and ignores any referring agent, so a hub visitor who searches homes becomes another agent's lead.
3. `POST /api/leads` inserts `agent_id` straight from the request body (any caller can plant contacts in any CRM). The hub route does it right; nothing new should use `/api/leads`.
4. Hub lead route sets no `rating`, `lead_status`, `lifecycle_stage`, `intake_channel`; sends no notification; creates no task; enrols no follow-up.
5. No rate limiting on the public lead endpoint (documented as deliberate).
6. `app/dashboard/marketing/page.tsx` reads `traffic_events` with no `agent_id` filter — every agent's hub views are blended into one agent's funnel numbers.
7. `createTask()` in `lib/crm/pipeline/tasks.ts` defaults `priority: "normal"` / `source: "agent"`, which fail the `crm_tasks` CHECKs; the voice booking path inserts directly with valid values.

## F. Database gaps

- Nowhere to store hub configuration (hero, CTAs, services, tools, areas, social, featured, assistant, lead-capture, SEO, appearance).
- Nowhere to persist visitor AI conversations (`support_conversations` is CloseBoss-support scoped; `sms_conversations` is keyed on a contact).
- `traffic_events` has no index for "this agent, this event type, this month".

Decision: one JSONB config row per agent (`agent_hub_settings.config`, validated in code) rather than eight normalized tables. Lists here are per-agent and short (≤ 12 services, ≤ 20 areas); the precedent is `agents.onboarding` and `agents.dt_brand_profile`. A new `hub_conversations` table follows the `sms_conversations` jsonb-transcript shape, keyed on `(agent_id, visitor_id)`.

## G. Integration opportunities

- AI assistant: Anthropic tool-use with one `capture_lead` tool; system prompt from hub profile + bio + specialties + areas + services + receptionist notes + assistant knowledge; conversation → `hub_conversations`; lead → the shared hub capture path.
- Home value: reuse `POST /api/property/estimate` (guest path already exists) inside a hub-branded page; capture through the hub lead path with `tool_used = home_value`, `property_address`, `estimated_home_value`.
- Home search: pass `agent` through `/homes` → `/homes/search` → `IdxLeadCaptureModal` → `idx/lead-capture` resolves the handle **server-side** before falling back to round-robin.
- Booking: reuse `getAvailability()` / `bookAppointment()` (source `marketing_hub`) when the agent's receptionist booking is on; else external URL; else "request a consultation" (lead + task).
- Workforce: `ensureAssistantsForAgent()` rows + receptionist enabled flag decide what may be shown; the agent chooses visibility and public wording.
- Notifications: inbox row + push + email to the agent on every hub lead, using the resolved agent id (never `notifyAllAgentsNewLead`).
- Testimonials: read `testimonials where is_published`; a small CRUD in the editor.

## H. Implementation plan (this branch)

1. Foundation: migration (`agent_hub_settings`, `hub_conversations`, indexes, RLS), `lib/marketing-hub/config.ts` (schema + defaults + normalizer, pure), shared `captureHubLead()`.
2. Public hub: own shell (no CloseBoss chrome), sections Hero → AI assistant → Workforce → How-it-works → Services → Tools → Home value → Areas → Featured → Feed → Trust → Final CTA → Footer; mobile-first; sticky mobile CTA bar; every section has an empty state or is hidden.
3. AI: `POST /api/public/hub/[username]/chat` (rate limited per browser/day and per conversation), `lib/marketing-hub/chat/*`, chat UI.
4. Funnels: `/@user/home-value`, `/@user/book`, `/homes?agent=` attribution fix, event beacon `POST /api/public/hub/[username]/event`.
5. Editor: sectioned `/dashboard/hub` (Overview, Profile, Hero, Services, AI Assistant, AI Workforce, Tools, Market Areas, Content, Social, Lead Capture, SEO, Appearance, Analytics, Settings), `GET/PUT /api/dashboard/hub/config`, `GET /api/dashboard/hub/metrics`, testimonials CRUD.
6. SEO: configurable title/description/OG image/noindex; `RealEstateAgent` JSON-LD from real fields only.
7. i18n (en + zh-Hans), tests for the pure modules, typecheck, live verification on the dev server.

Out of scope for this branch (called out in the final report): per-area SEO pages `/@user/<area>`, streaming AI responses, CAPTCHA.
