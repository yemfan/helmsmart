# HANDOFF.md — SwipenDone Phase 1
**Doc:** SD-HANDOFF-001 · **From:** Claude (chat) / FND · **To:** Claude Code · **Date:** 2026-07-16
**Parent spec:** SWIPENDONE-MVP-SPEC.md (SD-SPEC-001)

---

## 1. Project context

SwipenDone turns a seller's photos + rough notes into a hosted, swipeable, bilingual (EN/中文) instruction guide served at a QR-linked URL, with AI diagnosis planned for Phase 2. Target user: SMB manufacturers, importers, Amazon/Alibaba sellers. Positioning: **"AI instructions get them assembled. AI diagnosis keeps them from returning it."**

This handoff covers **Phase 1**: creator dashboard (upload → AI generation → edit → publish), public buyer guide, QR generation, scan logging. Phase 2 (diagnosis) is spec'd but NOT in scope — however, the data model below includes Phase 2 tables so no migration pain later.

## 2. Existing assets (provided alongside this doc)

| File | What it is | What to do with it |
|---|---|---|
| `index.html` | Landing page (waitlist), vanilla HTML/CSS/JS | Serve at `/` as static page or port into Next.js route. Contains Supabase waitlist config block at top of `<script>` — wire env vars. |
| `swipendone-guide.jsx` | Buyer guide prototype (React, hardcoded TV stand demo) | Port to `/g/[slug]` route. Replace hardcoded content with DB-driven data. Keep the design system exactly: tokens, die-cut step tag, parts checklist, EN/中文 toggle, swipe + keyboard nav, done-screen registration. |

**Design tokens (do not change):** paper `#F2F4F1`, card `#FFFFFF`, ink `#1C2B24`, ink-soft `#5A6B62`, line `#D6DCD6`, accent `#E8531F`, green `#2F6B4F`, green-soft `#E4EFE8`. Fonts: Archivo (display), Inter (body), IBM Plex Mono (utility), Noto Sans SC (zh). zh body font order flips to Noto-first.

## 3. Stack & setup

- **Next.js 14+ (App Router) on Vercel.** New repo `swipendone`. Domain: swipendone.com (registered; DNS via Vercel).
- **Supabase**: auth (email magic link is fine for MVP), Postgres, Storage (bucket `guide-images`, public read).
- **Claude API** for generation + translation. Model: `claude-sonnet-4-6`. Server-side only — never expose the key client-side.
- **QR**: `qrcode` npm package, generate server-side, offer PNG (1200px) + SVG downloads.

### Env vars
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server only
ANTHROPIC_API_KEY=                # server only
NEXT_PUBLIC_APP_URL=https://swipendone.com
```

## 4. Database schema (run as Supabase migration)

```sql
create table sellers (
  id uuid primary key references auth.users(id),
  email text not null,
  brand_name text,
  preferred_lang text default 'en' check (preferred_lang in ('en','zh')),
  created_at timestamptz default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references sellers(id) on delete cascade,
  name_en text not null,
  name_zh text,
  model_no text,
  created_at timestamptz default now()
);

create table guides (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  slug text unique not null,              -- short, url-safe, immutable once published
  status text default 'draft' check (status in ('draft','published','archived')),
  version int default 1,
  meta_en jsonb default '{}',             -- {time_estimate, people, tools}
  meta_zh jsonb default '{}',
  parts jsonb default '[]',               -- [{code,name_en,name_zh,qty}]
  published_at timestamptz,
  created_at timestamptz default now()
);

create table steps (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references guides(id) on delete cascade,
  position int not null,
  title_en text, title_zh text,
  body_en text, body_zh text,
  tip_en text, tip_zh text,
  image_url text,
  unique (guide_id, position)
);

create table scans (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references guides(id) on delete cascade,
  lang text, user_agent text, referrer text,
  created_at timestamptz default now()
);

create table step_events (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid references scans(id) on delete cascade,
  guide_id uuid not null,
  step_position int,
  action text check (action in ('view','complete','parts_checked','finished','register_clicked')),
  created_at timestamptz default now()
);

-- Phase 2 tables (create now, unused until diagnosis ships)
create table diagnoses (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references guides(id) on delete cascade,
  scan_id uuid references scans(id),
  step_ref int, input_text text, photo_url text,
  ai_response text, resolved boolean, escalated boolean default false,
  created_at timestamptz default now()
);

create table registrations (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references guides(id) on delete cascade,
  buyer_email text not null,
  consent boolean default true,
  created_at timestamptz default now()
);

create table waitlist (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  created_at timestamptz default now()
);
```

**RLS:** enable on all tables. Sellers: full CRUD on own rows (`seller_id = auth.uid()` chains). Public (anon): SELECT on published guides + their steps only; INSERT on scans, step_events, registrations, waitlist. No anon SELECT on scans/events/registrations. Analytics reads go through authenticated seller policies or server routes with service role.

## 5. Routes

### Public
- `/` — landing page (port index.html; wire waitlist form to `waitlist` table via server action instead of client-side anon key if simpler).
- `/g/[slug]` — buyer guide. SSR fetch of published guide + steps. On load: insert `scans` row (server action; capture lang, UA, referrer). Log `step_events` client-side via lightweight POST (`/api/e`) — fire-and-forget, never block UI. Must render well with JS disabled down to a readable fallback list (SEO + resilience).
- `/g/[slug]/qr` — returns QR PNG for the guide URL (also downloadable from dashboard).

### Authenticated (creator)
- `/app` — guide list: name, status, scan count (7d), created date. Empty state: "Create your first guide."
- `/app/new` — creation wizard, 3 screens:
  1. **Upload**: product name, model no, drag-drop images (jpeg/png/webp, max 10MB each, max 20), free-text notes textarea, optional file upload of existing manual (pdf/docx/txt — extract text server-side, pdf via `pdf-parse`, docx via `mammoth`).
  2. **Generate**: call `/api/generate` (see §6). Show progress state. On return, land in editor.
  3. **Editor**: reorder steps (drag), edit all EN/zh fields side-by-side, assign images to steps (AI proposes assignment; seller can change), edit parts list, edit meta. Save = upsert draft.
- `/app/guide/[id]` — editor for existing guide + **Publish** button (generates slug on first publish: 8-char base58, immutable) + QR download + hosted link + "View analytics" (v1: scan count, completion rate = finished events / scans, per-step view counts as a simple bar list — use plain divs, no chart lib needed).

## 6. AI generation (`/api/generate`, server route)

Input: `{ product_name, model_no, notes, extracted_manual_text?, image_urls[] }` (images already uploaded to Storage from the client).

Single Claude API call with images attached (base64 or URL-fetched server-side). System prompt requirements:

- Role: technical writer for consumer product instructions.
- Output **strict JSON only** (no markdown fences): 
```json
{
  "meta_en": {"time_estimate":"","people":"","tools":""},
  "meta_zh": {...},
  "parts": [{"code":"A","name_en":"","name_zh":"","qty":1}],
  "steps": [{"title_en":"","title_zh":"","body_en":"","body_zh":"","tip_en":"","tip_zh":"","image_index":0}]
}
```
- Rules to encode in the prompt: 3–9 steps; imperative voice; one action per step; body ≤ 2 sentences; every step gets a practical tip; zh is natural Simplified Chinese written for the zh reader, not literal translation; parts codes A, B, C…; `image_index` maps to the input image order, use best-fit or null.
- Parse defensively: strip fences if present, `JSON.parse` in try/catch, validate shape with zod, retry once on failure with the error appended, then surface a friendly editor-side error ("Generation failed — try fewer images or simpler notes").

Rate limit: 10 generations/hour/seller (simple counter table or Upstash if already available; a Postgres count query is fine for MVP).

## 7. Buyer guide port checklist (from swipendone-guide.jsx)

- [ ] Cover card ← `guides.meta_*` + product name
- [ ] Parts checklist ← `guides.parts`; "missing a part" button = `mailto:` seller for MVP
- [ ] Step cards ← `steps` ordered by position; image from `image_url`, fallback to a neutral placeholder card
- [ ] Progress bar, swipe, arrow keys, EN/中文 toggle — as prototype
- [ ] Done screen: registration form → INSERT `registrations`, then success state; "Made with SwipenDone" watermark links to `/`
- [ ] Log step_events: view (per card), parts_checked, finished, register_clicked
- [ ] Mobile-first 430px column; respects `prefers-reduced-motion`; focus-visible outlines

## 8. Acceptance criteria (Phase 1 done =)

1. Seller signs up, uploads 6 photos + notes, gets an editable bilingual draft in < 60s.
2. Publishing yields a live `/g/[slug]` URL + downloadable QR that resolves to it.
3. Guide scores ≥ 90 Lighthouse mobile performance; loads < 2s on 4G.
4. Editing after publish updates the live guide at the same slug (printed QR never breaks).
5. Scan + event rows appear for every real visit; seller sees counts in dashboard.
6. Full flow works in both languages end to end.
7. No Claude API key or service-role key reachable from the client bundle.

## 9. Out of scope (do not build)

Payments, teams, diagnosis UI (tables only), voice input, video, PDF export (Phase 3), custom domains, white-label.

## 10. Post-build

- Deploy to Vercel prod on swipendone.com. After deploy: `vercel cache purge`, confirm uniform `?dpl=` + `Age: 0` before validation (per fleet convention).
- Ping TOM for a TVR pass against this doc's acceptance criteria.
- Report back: anything ambiguous in this handoff, decisions made unilaterally, and known debt.
