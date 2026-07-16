# maxyinvestment

Corporate site for **MAXY Investment Inc.** (maxyinvestment.com) — the innovation holding company
behind HelmSmart, RealtorBoss, LeadSmart AI, and VoltrixOS.

Standalone Next.js app: no Supabase, no auth, no workspace dependencies. All copy lives in
[`lib/content.ts`](lib/content.ts) — adding a portfolio company or a timeline milestone is an edit
there, not a component change.

## Develop

```bash
pnpm --filter maxyinvestment dev     # http://localhost:3006
pnpm --filter maxyinvestment build
pnpm --filter maxyinvestment typecheck
```

## Deploy (Vercel)

Its own Vercel project with **Root Directory = `apps/maxyinvestment`**, domain `maxyinvestment.com`.
Optionally set `NEXT_PUBLIC_APP_URL` to override the base URL used by `robots.ts` / `sitemap.ts`
(defaults to the production URL in `lib/content.ts`).

The original static mockup this was built from is kept in `MAXY_Website_Updated_With_Timeline/` for
reference.
