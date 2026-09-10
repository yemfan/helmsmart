# Access control (Guest / Free / Premium)

## Modules

| File | Role |
|------|------|
| `lib/access.ts` | `resolveAccessTier`, `canUseTool`, `DEFAULT_LIMITS`, RPC tool mapping |
| `lib/usage.ts` | `getUsage()`, `incrementUsage()`, guest `localStorage` daily counters |
| `app/api/access/usage/route.ts` | `GET` — tier + usage for the signed-in user (or guest defaults) |
| `components/AuthProvider.tsx` | Supabase session (`user`, `loading`, `refresh`, `openAuth` / `closeAuth`); embeds `AuthModal` (same pattern as CloseBoss) |
| `components/AuthModal.tsx` | Email/password login + signup (Supabase Auth) |
| `components/PaywallModal.tsx` | Premium upsell (links to `/pricing`) |
| `components/AccessProvider.tsx` | Wraps auth; `useAccess()` — tier, usage, `refresh` (auth + usage), `openAuth`, `openPaywall` |

## Tiers

- **Guest** — not signed in; daily limits enforced client-side (`localStorage` key `propertytoolsai:guest_tool_usage:v1`).
- **Free** — signed in; monthly limits for `estimator` / `cma` via Supabase `increment_usage` RPC (see `20260319_usage_limits.sql`).
- **Premium** — any of:
  - `user_profiles.role` in `PREMIUM_GRANT_ROLES` (`lib/access.ts`) — e.g. `agent`, `broker`, `admin`, `support`, plus broker leadership roles shared with CloseBoss; or
  - `subscription_status` in `active` / `trialing`, or `plan` in `premium` / `elite`.

## Usage in UI

```tsx
import { useAuth } from "@/components/AuthProvider";
import { useAccess } from "@/components/AccessProvider";
import { canUseTool } from "@/lib/access";
import { getUsage } from "@/lib/usage";

const { user } = useAuth();
const { tier, openAuth, openPaywall, refresh } = useAccess();
```

- Use **`useAuth()`** for “is there a Supabase session?” (header, account menu visibility).
- Use **`useAccess()`** for tier, limits, and paywall (`tier` can still be `"guest"` briefly after login until `/api/access/usage` returns).

Combine `getUsage()` + `canUseTool({ tier, tool, used, limit })` before running an expensive tool action.
