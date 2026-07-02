# RealtorBoss → RealtyBoss rename — intentionally left references

PR-1 of HANDOFF_BOSS_V2 (2026-07) standardized the product name to **RealtyBoss**.
The following "realtorboss" references are intentionally left in place. Do not
"fix" them.

## Historical Supabase migrations (immutable)

- `supabase/migrations/20260637000000_realtorboss_ai_team.sql`
- `supabase/migrations/20260641000000_realtorboss_accountant.sql`
- `supabase/migrations/20260644000000_realtorboss_marketing_assistant.sql`

Applied migration files are history; renaming them would desync
`supabase_migrations.schema_migrations`. Current-state DB comments were updated
by `20260702000000_realtyboss_rename_comments.sql`.

## Compat rewrites in `next.config.js`

- `/api/dashboard/realtorboss/:path*` → `/api/dashboard/realtyboss/:path*` —
  shipped **leadsmart-mobile** builds call the old paths with bearer tokens.
  Remove only after mobile forced-upgrade covers builds released before 2026-07.
- `/brand/realtorboss/realtorboss-:file` → `/brand/realtyboss/realtyboss-:file` —
  installed kiosk PWA manifests and previously emailed/indexed JSON-LD embed the
  old asset URLs.

## Historical data (do NOT rewrite rows)

- Analytics `events` rows and any `assistant_activities` metadata written before
  the rename may contain "realtorboss" strings. Read-side code treats the two
  names as the same product; never mass-update historical rows.

## Local asset folders (untracked)

- `apps/RealtorBoss-Avatars/`, `apps/RealtorBoss-Logo/` — untracked design
  sources on the owner's machine; rename at the owner's discretion.

## Brand artwork note

`public/brand/realtyboss/realtyboss-{mark,glyph,lockup}.svg` and the generated
PNGs still carry pre-rename artwork (renamed files, same pixels). The canonical
new mark is `realtyboss-icon.svg` (crown+R, also `app/icon.svg`). Regenerate via
`scripts/generate-brand-icons.mjs` when updated artwork lands.
