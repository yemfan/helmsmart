# Supabase (CloseBoss mobile)

This folder mirrors **`apps/leadsmartai/supabase/migrations`** so you can run the CLI from the mobile app directory. The **database is the same** as the Next.js app—keep migrations in sync when adding new `.sql` files (copy both places or add only under `leadsmartai` and re-copy).

## Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli) (`npx supabase` works)
- Access token: [Supabase Dashboard → Account → Access Tokens](https://supabase.com/dashboard/account/tokens)  
  Set `SUPABASE_ACCESS_TOKEN` in your environment before `link` / `db push` (do not commit it).

## Connection

- **Project ref:** `babmbowmzwizoahkmshx` (from your Supabase URL)
- App credentials: use **`apps/leadsmart-mobile/.env.local`** with `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` **or** `EXPO_PUBLIC_*` (see `app.config.ts` fallbacks).

## Commands (from `apps/leadsmart-mobile`)

```bash
# One-time: link CLI to the remote project (requires SUPABASE_ACCESS_TOKEN)
npx supabase link --project-ref babmbowmzwizoahkmshx

# Apply pending migrations to the linked remote database
npx supabase db push
```

If the remote database already has schema from another pipeline, `db push` applies only **new** migrations not yet recorded in `supabase_migrations.schema_migrations`.

## Troubleshooting

- **Login / token:** `supabase login` or export `SUPABASE_ACCESS_TOKEN`.
- **Drift:** If migrations were applied manually in the Dashboard, history can differ—use Dashboard SQL or repair migration history per Supabase docs.
- **Duplicate copies:** The canonical migration set also lives under `apps/leadsmartai/supabase/migrations`; avoid editing only one copy long-term.
