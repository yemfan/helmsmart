# swipendone

**SwipenDone** — turn a seller's photos + rough notes into a hosted, swipeable, bilingual
(EN/中文) product-instruction guide served at a QR-linked URL. *AI instructions get them
assembled; AI diagnosis keeps them from returning it* (diagnosis is Phase 2 — schema only).

Next.js 16 (App Router) · Supabase (auth + Postgres + Storage) · Claude API for generation.

## Develop

```bash
pnpm --filter swipendone dev        # http://localhost:3007
pnpm --filter swipendone build
pnpm --filter swipendone typecheck
```

## Environment

Copy `.env.example` → `.env.local` and fill in:

| Var | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | project `swipendone` (`gapwkpwotggtymnyortr`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | needed for scan/event logging, waitlist, generation, publish |
| `ANTHROPIC_API_KEY` | **server only** | `claude-sonnet-4-6` generation |
| `NEXT_PUBLIC_APP_URL` | build | base for QR + share links (defaults to `https://swipendone.com`) |

Neither secret is bundled client-side — generation and all service-role writes run in
server routes / server actions only.

## Routes

- `/` — landing page + waitlist (server action → `waitlist`).
- `/g/[slug]` — public buyer guide (SSR, published only). Logs `scans` on load and
  `step_events` via `POST /api/e`. Renders a `<noscript>` fallback list for SEO/resilience.
- `/g/[slug]/qr` — print-ready QR (PNG 1200px; `?f=svg`; `?download=1`).
- `/login` — magic-link sign in.
- `/app` — seller guide list. `/app/new` — upload → generate wizard.
  `/app/guide/[id]` — bilingual editor + publish + QR + analytics.
- `POST /api/generate` — Claude generation (multipart; images pre-uploaded to Storage),
  rate-limited 10/hr/seller; creates the draft and returns its id.

## Database

Migrations live in [`supabase/migrations/`](supabase/migrations). RLS is on for every table:
sellers own their rows; anon may read published guides + their steps and insert
`scans`/`step_events`/`registrations`/`waitlist`. Storage bucket `guide-images` is
public-read (served via the public URL endpoint); sellers write only under their own
`{uid}/` prefix.

## Deploy (Vercel)

Own Vercel project, **Root Directory = `apps/swipendone`**, domain `swipendone.com`.
Set all env vars above in the project. After deploy, verify a published guide renders and
its QR resolves.

## Known debt

- "Missing a part?" on the buyer guide is a no-op button (seller email isn't exposed to
  anon by design); wire to a support channel when Phase 2 lands.
- Manual-file extraction is best-effort (`pdf-parse` / `mammoth`); scanned-image PDFs yield
  no text and fall back to photos + notes.
- Analytics reads run per-guide count queries (fine at MVP volume).
